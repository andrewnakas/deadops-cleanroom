import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetManager } from './runtime-assets.js';
import { TIERS, currentTier } from './gfx.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// CC0 glTF models (see assets/LICENSES.csv). Each model is normalised once to a
// target size in game units and its clips are indexed by short name.
const loader=new GLTFLoader(assetManager),cache=new Map();
const shortName=n=>n.split('|').pop();
export function loadAsset(url){
  if(!cache.has(url))cache.set(url,loader.loadAsync(url).then(gltf=>{
    const clips=new Map();for(const c of gltf.animations){const k=shortName(c.name);if(!clips.has(k)){c.name=k;clips.set(k,c);}}
    gltf.scene.traverse(o=>{if(o.isMesh){o.frustumCulled=false;for(const m of [o.material].flat())if(m){m.side=THREE.FrontSide;if(m.map)m.map.colorSpace=THREE.SRGBColorSpace;}}});
    return {url,scene:gltf.scene,clips,sizes:new Map()};
  }));
  return cache.get(url);
}
// Flat-coloured gun models get machined-looking surfaces: rounded shading across soft edges and a
// material chosen from the paint colour (dark = blued steel, brown = oiled wood, else polymer).
export function refineGun(asset){
  if(asset.refined)return asset;asset.refined=true;const hsl={};
  asset.scene.traverse(o=>{
    if(!o.isMesh||o.isSkinnedMesh)return;
    // textured, quantized models already have good normals (and re-indexing would lose their packed UVs)
    if(![o.material].flat().some(x=>x.map)){try{o.geometry=toCreasedNormals(o.geometry,.7);}catch{}}
    o.material=[o.material].flat().map(m=>{
      if(m.map||m.normalMap)return m;const c=m.clone();c.color.getHSL(hsl);
      if(hsl.l<.2||hsl.s<.12){c.metalness=.86;c.roughness=hsl.l<.2?.36:.3;c.color.multiplyScalar(hsl.l<.2?1.1:.42);}
      else if(hsl.h>.03&&hsl.h<.13){c.metalness=0;c.roughness=.5;c.color.multiplyScalar(.7);}
      else{c.metalness=.15;c.roughness=.55;c.color.multiplyScalar(.8);}
      c.envMapIntensity=.9;return c;});
    if(o.material.length===1)o.material=o.material[0];
  });
  return asset;
}
// Characters arrive as bright, faceted toy figures. `soften` rounds their shading once per asset;
// `gritty` mutes a material's colours and lays dirt and dried blood over it in the shader, placed in
// the model's own space so the marks stay put as the skeleton moves.
// Average the face normals of every vertex that shares a position (fast: one pass with a numeric hash).
function smoothNormals(g){
  const p=g.getAttribute('position'),n=g.getAttribute('normal');if(!p||!n)return;const sums=new Map(),keys=new Float64Array(p.count);
  for(let i=0;i<p.count;i++){const k=Math.round(p.getX(i)*2e3)*73856093+Math.round(p.getY(i)*2e3)*19349663+Math.round(p.getZ(i)*2e3)*83492791;keys[i]=k;let s=sums.get(k);if(!s)sums.set(k,s=[0,0,0]);s[0]+=n.getX(i);s[1]+=n.getY(i);s[2]+=n.getZ(i);}
  for(let i=0;i<p.count;i++){const s=sums.get(keys[i]),l=Math.hypot(s[0],s[1],s[2])||1;n.setXYZ(i,s[0]/l,s[1]/l,s[2]/l);}
  n.needsUpdate=true;
}
export function soften(asset){
  if(asset.softened)return asset;asset.softened=true;asset.span=1e-3;
  // span is measured in the units the vertices are stored in, which is the space the grit noise runs in
  asset.scene.traverse(o=>{if(o.isMesh){smoothNormals(o.geometry);o.geometry.computeBoundingBox();const s=o.geometry.boundingBox.getSize(new THREE.Vector3());asset.span=Math.max(asset.span,s.x,s.y,s.z);}});
  return asset;
}
const GRIT_GLSL=`
float gtHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float gtNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(gtHash(i),gtHash(i+vec3(1,0,0)),f.x),mix(gtHash(i+vec3(0,1,0)),gtHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(gtHash(i+vec3(0,0,1)),gtHash(i+vec3(1,0,1)),f.x),mix(gtHash(i+vec3(0,1,1)),gtHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float gtFbm(vec3 p){return gtNoise(p)*.66+gtNoise(p*2.6+5.)*.34;}`;
export function gritty(material,{desat=.6,dirt=.5,blood=0,freq=6,seed=0,tone=0xffffff}={}){
  material.roughness=Math.max(material.roughness??.8,.72);material.metalness=Math.min(material.metalness??0,.1);material.flatShading=false;
  // the low tier keeps the muted colour but skips the per-pixel noise
  if(!TIERS[currentTier.last].post){material.color.multiply(new THREE.Color(tone)).multiplyScalar(1-dirt*.25);return material;}
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{gtDesat:{value:desat},gtDirt:{value:dirt},gtBlood:{value:blood},gtFreq:{value:freq},gtSeed:{value:seed},gtTone:{value:new THREE.Color(tone)}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gtPos;').replace('#include <begin_vertex>','#include <begin_vertex>\ngtPos=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 gtPos;uniform float gtDesat,gtDirt,gtBlood,gtFreq,gtSeed;uniform vec3 gtTone;float gtWet;'+GRIT_GLSL)
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec3 gtP=gtPos*gtFreq+gtSeed*7.3;float gtL=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(gtL),gtDesat)*gtTone;
        float gtD=smoothstep(.42,.75,gtFbm(gtP*.8));diffuseColor.rgb*=1.-gtD*gtDirt*.7;
        gtWet=smoothstep(.62,.74,gtFbm(gtP*1.25+31.))*gtBlood;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.012,.01),gtWet*.92);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.5,gtWet);');
  };
  material.customProgramCacheKey=()=>'gritty';material.needsUpdate=true;return material;
}
// Clone and scale so the chosen axis spans `size` units ('y' height, 'x'/'z' length, 'max' longest side).
export function instance(asset,size,axis='y'){
  const key=axis+size;
  if(!asset.sizes.has(key)){
    const probe=clone(asset.scene);probe.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(probe,true),dims=box.getSize(new THREE.Vector3());
    const span=axis==='max'?Math.max(dims.x,dims.y,dims.z):dims[axis];
    const scale=size/Math.max(1e-6,span);
    asset.sizes.set(key,{scale,min:box.min.clone().multiplyScalar(scale),max:box.max.clone().multiplyScalar(scale)});
  }
  const {scale,min,max}=asset.sizes.get(key),inner=clone(asset.scene),root=new THREE.Group();
  inner.scale.setScalar(scale);root.add(inner);root.userData.bounds={min:min.clone(),max:max.clone()};root.userData.inner=inner;
  return root;
}
// Animation mixer keyed by clip short names ("Walk", "Run", "Death", ...).
export class ClipRig {
  constructor(root,clips){this.root=root;this.clips=clips;this.mixer=new THREE.AnimationMixer(root);this.actions={};this.current=null;}
  map(key,clipName){const c=this.clips.get(clipName);if(c)this.actions[key]=this.mixer.clipAction(c);return !!c;}
  play(key,loop=true,speed=1,fade=.15){
    const a=this.actions[key];if(!a)return false;if(this.current===key&&loop){a.timeScale=speed;return true;}
    const old=this.actions[this.current];if(old&&old!==a)old.fadeOut(fade);
    a.reset().setEffectiveWeight(1).setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);a.clampWhenFinished=!loop;a.timeScale=speed;a.fadeIn(fade).play();this.current=key;return true;
  }
  duration(key){return this.actions[key]?.getClip().duration??0;}
  update(dt){this.mixer.update(dt);}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);}
}
