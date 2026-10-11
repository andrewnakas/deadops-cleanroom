import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { onSettings } from './settings.js';
import { TIERS, currentTier, pixelRatio, lowerCeiling, autoQuality } from './gfx.js';

// Frame pipeline shared by every mode: world pass, first-person weapon pass on a cleared
// depth buffer, then (medium and up) ambient occlusion under the weapon, bloom, and a colour grade
// with sharpening, a little lens fringing, vignette and grain. Tier numbers come from gfx.js.
// The low tier renders straight to the screen, as phones always have.
const Grade={
  uniforms:{tDiffuse:{value:null},time:{value:0},vignette:{value:.55},grain:{value:.035},saturation:{value:1.06},contrast:{value:1.05},tint:{value:new THREE.Color(1,1,1)},hurt:{value:0},flash:{value:0},blurry:{value:0},sharpen:{value:.35},fringe:{value:.0012},px:{value:new THREE.Vector2(1/1280,1/720)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform float time,vignette,grain,saturation,contrast,hurt,flash,blurry,sharpen,fringe;uniform vec3 tint;uniform vec2 px;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*37.)*43758.5453);}
    void main(){
      vec2 d=vUv-.5;vec4 c=texture2D(tDiffuse,vUv);
      if(fringe>0.){vec2 f=d*dot(d,d)*fringe*8.;c.r=texture2D(tDiffuse,vUv+f).r;c.b=texture2D(tDiffuse,vUv-f).b;}
      if(sharpen>0.&&blurry<=0.){vec3 n=texture2D(tDiffuse,vUv+vec2(px.x,0.)).rgb+texture2D(tDiffuse,vUv-vec2(px.x,0.)).rgb+texture2D(tDiffuse,vUv+vec2(0.,px.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.,px.y)).rgb;
        vec3 e=c.rgb-n*.25;c.rgb+=clamp(e,-.12,.12)*sharpen*2.;}
      if(blurry>0.){vec2 o=px*6.*blurry;c=(c+texture2D(tDiffuse,vUv+vec2(o.x,0.))+texture2D(tDiffuse,vUv-vec2(o.x,0.))+texture2D(tDiffuse,vUv+vec2(0.,o.y))+texture2D(tDiffuse,vUv-vec2(0.,o.y)))/5.;}
      float l=dot(c.rgb,vec3(.2126,.7152,.0722));
      c.rgb=mix(vec3(l),c.rgb,saturation*(1.-hurt*.6));c.rgb=(c.rgb-.18)*contrast+.18;c.rgb*=tint;
      float v=smoothstep(.25,.85,length(d)*1.25);c.rgb*=1.-v*vignette;c.rgb+=vec3(.5,.02,.02)*v*hurt*.5;
      c.rgb+=(hash(vUv*vec2(1280.,720.))-.5)*grain*(.3+l);c.rgb=mix(c.rgb,vec3(1.6),flash);
      gl_FragColor=vec4(max(c.rgb,0.),c.a);}`,
};
// Ambient occlusion sees only solid surfaces: sprites, glows and other see-through things are hidden
// while its depth and normal buffer is drawn, or every puff of smoke would cast a dark halo.
class WorldAO extends GTAOPass {
  // half resolution: the occlusion is soft, and this is the most expensive pass per pixel
  setSize(w,h){super.setSize(Math.ceil(w/2),Math.ceil(h/2));}
  _overrideVisibility(){const cache=this._visibilityCache;this.scene.traverse(o=>{if(!o.visible)return;const m=o.material;
    if(o.isPoints||o.isLine||o.isSprite||o.userData.noAO||(m&&!Array.isArray(m)&&(m.transparent||m.depthWrite===false))){o.visible=false;cache.push(o);}});}
}
export class Pipeline {
  constructor({renderer,scene,camera,viewScene,viewCamera,mobile=false}){
    Object.assign(this,{renderer,scene,camera,viewScene,viewCamera,mobile});this.composer=null;this.time=0;this.grade={};this.slow=0;this.fast=0;this.listeners=new Set();this.build();globalThis.gfx=this;
    onSettings(k=>{if(k==='quality'||k===null)this.build();});
  }
  get tier(){return currentTier(this.mobile);}
  get info(){return TIERS[this.tier];}
  onTier(fn){this.listeners.add(fn);}
  build(){
    this.composer?.dispose?.();this.composer=null;this.ao=null;const tier=this.tier,T=TIERS[tier],r=this.renderer;r.setPixelRatio(pixelRatio(tier));
    for(const fn of this.listeners)fn(tier,T);
    if(!T.post)return;
    const size=r.getDrawingBufferSize(new THREE.Vector2());
    const target=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,samples:T.msaa});
    const c=this.composer=new EffectComposer(r,target);
    c.addPass(new RenderPass(this.scene,this.camera));
    if(T.ao){
      const ao=this.ao=new WorldAO(this.scene,this.camera,Math.ceil(size.x/2),Math.ceil(size.y/2),undefined,{radius:26,distanceExponent:1.4,thickness:1.6,distanceFallOff:1,scale:1.15,samples:12,screenSpaceRadius:false},{lumaPhi:10,depthPhi:6,normalPhi:3,radius:4,radiusExponent:1,rings:2,samples:12});
      ao.blendIntensity=.9;c.addPass(ao);
    }
    this.viewPass=new RenderPass(this.viewScene,this.viewCamera);this.viewPass.clear=false;this.viewPass.clearDepth=true;c.addPass(this.viewPass);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(size.x/2,size.y/2),T.bloom,.6,.9);c.addPass(this.bloom);
    this.gradePass=new ShaderPass(Grade);this.gradePass.uniforms.sharpen.value=T.sharpen;c.addPass(this.gradePass);c.addPass(new OutputPass());
    for(const [k,v] of Object.entries(this.grade))this.setGrade(k,v);
  }
  // Grade values: vignette, grain, saturation, contrast, hurt, flash, blurry, sharpen, fringe, tint (Color).
  setGrade(key,value){this.grade[key]=value;const u=this.gradePass?.uniforms[key];if(!u)return;if(u.value?.isColor)u.value.set(value);else u.value=value;}
  resize(w,h){this.renderer.setPixelRatio(pixelRatio(this.tier,w,h));this.renderer.setSize(w,h);this.composer?.setSize(w,h);}
  // On 'auto', three seconds of slow frames step the tier down once for the session.
  watch(dt){
    if(!autoQuality()||this.mobile||document.hidden)return;
    if(dt>1/30){this.slow+=dt;this.fast=0;}else{this.fast+=dt;if(this.fast>.5)this.slow=0;}
    if(this.slow>4){this.slow=0;if(lowerCeiling())this.build();}
  }
  // Build every shader behind the loading screen, so the first seconds of play do not stall while they
  // compile. `extra` objects (a soldier of each team, say) are shown to the compiler and taken out again.
  async warm(extra=[]){
    const r=this.renderer,added=extra.filter(o=>o?.isObject3D&&!o.parent);for(const o of added)this.scene.add(o);
    try{r.setRenderTarget(this.composer?.readBuffer??null);await r.compileAsync(this.scene,this.camera);await r.compileAsync(this.viewScene,this.viewCamera);r.setRenderTarget(null);this.render(0);this.render(0);}
    catch(e){console.info('shader warm-up skipped',e.message);r.setRenderTarget(null);}
    for(const o of added)this.scene.remove(o);
  }
  render(dt,{view=true}={}){
    this.time+=dt;this.watch(dt);const r=this.renderer;
    if(!this.composer){r.clear();r.render(this.scene,this.camera);if(view){r.clearDepth();r.render(this.viewScene,this.viewCamera);}return;}
    this.viewPass.enabled=view;const u=this.gradePass.uniforms;u.time.value=this.time%100;r.getDrawingBufferSize(u.px.value);u.px.value.set(1/u.px.value.x,1/u.px.value.y);
    this.composer.render(dt);
  }
}
// Turn on shadows (medium and up): call once the scene's static meshes exist. `lights` are taken in
// order up to the tier's count; `receivers` both cast and receive, `casters` only cast.
export function enableShadows(renderer,tier,{casters=[],receivers=[],lights=[]}={}){
  const T=TIERS[tier];if(!T.shadow)return false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  for(const o of receivers)o.traverse(m=>{if(m.isMesh&&!m.material?.transparent){m.receiveShadow=true;m.castShadow=true;}});
  for(const o of casters)o.traverse(m=>{if(m.isMesh)m.castShadow=true;});
  lights.slice(0,T.shadowLights).forEach((l,i)=>{l.castShadow=true;const n=l.isDirectionalLight?T.shadow:Math.min(T.shadow,i?1024:2048);l.shadow.mapSize.set(n,n);l.shadow.bias=l.isDirectionalLight?-.0004:-.0006;l.shadow.normalBias=l.isDirectionalLight?2.2:1.2;});
  return true;
}
