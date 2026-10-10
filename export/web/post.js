import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { qualityTier, onSettings } from './settings.js';

// Frame pipeline shared by every mode: world pass, first-person weapon pass on a cleared
// depth buffer, then (medium and high) bloom, a colour grade with vignette and grain.
// The low tier renders straight to the screen, as phones always have.
const Grade={
  uniforms:{tDiffuse:{value:null},time:{value:0},vignette:{value:.55},grain:{value:.035},saturation:{value:1.06},contrast:{value:1.05},tint:{value:new THREE.Color(1,1,1)},hurt:{value:0},flash:{value:0},blurry:{value:0},px:{value:new THREE.Vector2(1/1280,1/720)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform sampler2D tDiffuse;uniform float time,vignette,grain,saturation,contrast,hurt,flash,blurry;uniform vec3 tint;uniform vec2 px;varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+time*37.)*43758.5453);}
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      if(blurry>0.){vec2 o=px*6.*blurry;c=(c+texture2D(tDiffuse,vUv+vec2(o.x,0.))+texture2D(tDiffuse,vUv-vec2(o.x,0.))+texture2D(tDiffuse,vUv+vec2(0.,o.y))+texture2D(tDiffuse,vUv-vec2(0.,o.y)))/5.;}
      float l=dot(c.rgb,vec3(.2126,.7152,.0722));
      c.rgb=mix(vec3(l),c.rgb,saturation*(1.-hurt*.6));c.rgb=(c.rgb-.18)*contrast+.18;c.rgb*=tint;
      vec2 d=vUv-.5;float v=smoothstep(.25,.85,length(d)*1.25);c.rgb*=1.-v*vignette;c.rgb+=vec3(.5,.02,.02)*v*hurt*.5;
      c.rgb+=(hash(vUv*vec2(1280.,720.))-.5)*grain*(.3+l);c.rgb=mix(c.rgb,vec3(1.6),flash);
      gl_FragColor=vec4(max(c.rgb,0.),c.a);}`,
};
export class Pipeline {
  constructor({renderer,scene,camera,viewScene,viewCamera,mobile=false}){
    Object.assign(this,{renderer,scene,camera,viewScene,viewCamera,mobile});this.composer=null;this.time=0;this.grade={};this.build();
    onSettings(k=>{if(k==='quality'||k===null)this.build();});
  }
  get tier(){return qualityTier(this.mobile);}
  build(){
    this.composer?.dispose?.();this.composer=null;const tier=this.tier;this.renderer.setPixelRatio(Math.min(devicePixelRatio,tier==='low'?1:1.5));
    if(tier==='low')return;
    const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,samples:tier==='high'?4:0});
    const c=this.composer=new EffectComposer(this.renderer,target);
    c.addPass(new RenderPass(this.scene,this.camera));
    this.viewPass=new RenderPass(this.viewScene,this.viewCamera);this.viewPass.clear=false;this.viewPass.clearDepth=true;c.addPass(this.viewPass);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(size.x/2,size.y/2),tier==='high'?.34:.26,.55,.92);c.addPass(this.bloom);
    this.gradePass=new ShaderPass(Grade);c.addPass(this.gradePass);c.addPass(new OutputPass());
    for(const [k,v] of Object.entries(this.grade))this.setGrade(k,v);
  }
  // Grade values: vignette, grain, saturation, contrast, hurt, flash, blurry, tint (Color).
  setGrade(key,value){this.grade[key]=value;const u=this.gradePass?.uniforms[key];if(!u)return;if(u.value?.isColor)u.value.set(value);else u.value=value;}
  resize(w,h){this.renderer.setSize(w,h);this.composer?.setSize(w,h);}
  render(dt,{view=true}={}){
    this.time+=dt;const r=this.renderer;
    if(!this.composer){r.clear();r.render(this.scene,this.camera);if(view){r.clearDepth();r.render(this.viewScene,this.viewCamera);}return;}
    this.viewPass.enabled=view;const u=this.gradePass.uniforms;u.time.value=this.time%100;r.getDrawingBufferSize(u.px.value);u.px.value.set(1/u.px.value.x,1/u.px.value.y);
    this.composer.render(dt);
  }
}
// Turn on shadows for the high tier: call once the scene's static meshes exist.
export function enableShadows(renderer,tier,{casters=[],receivers=[],lights=[]}={}){
  if(tier!=='high')return false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  for(const o of receivers)o.traverse(m=>{if(m.isMesh){m.receiveShadow=true;m.castShadow=true;}});
  for(const o of casters)o.traverse(m=>{if(m.isMesh)m.castShadow=true;});
  for(const l of lights){l.castShadow=true;l.shadow.mapSize.set(2048,2048);l.shadow.bias=-.0006;l.shadow.normalBias=1.2;}
  return true;
}
