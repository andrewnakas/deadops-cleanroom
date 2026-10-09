import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetManager } from './runtime-assets.js';

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
