import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { settings, qualityTier } from './settings.js';

// Every quality number lives here: one row per tier, read by the renderer, the frame pipeline,
// the shadow setup and the texture loader. `pixels` caps the drawing buffer whatever the screen is.
export const TIER_ORDER=['low','medium','high','ultra'];
export const TIERS={
  low:   {ratio:1,  pixels:1.3e6,post:false,msaa:0,bloom:0,  ao:false,sharpen:0,  shadow:0,   shadowLights:0,softShadows:false,tex:512, aniso:4, shafts:false},
  medium:{ratio:1.5,pixels:2.2e6,post:true, msaa:0,bloom:.22,ao:false,sharpen:.3, shadow:1024,shadowLights:1,softShadows:false,tex:1024,aniso:8, shafts:true},
  high:  {ratio:2,  pixels:4.2e6,post:true, msaa:4,bloom:.28,ao:true, sharpen:.4, shadow:2048,shadowLights:3,softShadows:true, tex:1024,aniso:16,shafts:true},
  ultra: {ratio:2.5,pixels:9e6,  post:true, msaa:4,bloom:.3, ao:true, sharpen:.45,shadow:4096,shadowLights:4,softShadows:true, tex:2048,aniso:16,shafts:true},
};
// A session-only ceiling set by the frame-time watchdog (never stored: the player's choice stays theirs).
let ceiling=TIER_ORDER.length-1;
export const lowerCeiling=()=>{const now=TIER_ORDER.indexOf(currentTier.last);if(now<=0)return false;ceiling=now-1;return true;};
export function currentTier(mobile){const t=qualityTier(mobile);return currentTier.last=TIER_ORDER[Math.min(TIER_ORDER.indexOf(t),ceiling)]??'low';}
currentTier.last='low';
export const tierInfo=mobile=>TIERS[currentTier(mobile)];
export const autoQuality=()=>settings.quality==='auto'&&!navigator.webdriver;
export function pixelRatio(tier,w=innerWidth,h=innerHeight){const t=TIERS[tier];return Math.max(.5,Math.min(devicePixelRatio,t.ratio,Math.sqrt(t.pixels/Math.max(1,w*h))));}

export function createRenderer(profile,{exposure=1.1}={}){
  const tier=currentTier(profile.mobile);
  const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile,powerPreference:profile.mobile?'default':'high-performance'});
  renderer.setPixelRatio(pixelRatio(tier));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;renderer.autoClear=false;
  renderer.userData={mobile:profile.mobile,anisotropy:Math.min(TIERS[tier].aniso,renderer.capabilities.getMaxAnisotropy())};
  document.body.prepend(renderer.domElement);
  return renderer;
}

// Image-based lighting from an equirectangular HDR: reflections and soft fill for every PBR material.
// `background` also shows it as the sky. Scenes listed in `also` (the weapon scene) share the light.
const envCache=new Map();
export async function loadEnvironment(renderer,scene,url,{background=false,intensity=1,backgroundIntensity=1,rotation=0,also=[]}={}){
  let entry=envCache.get(url);
  if(!entry){
    const hdr=await new HDRLoader().loadAsync(url);hdr.mapping=THREE.EquirectangularReflectionMapping;
    const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(hdr).texture;pmrem.dispose();
    envCache.set(url,entry={hdr,env});
  }
  for(const s of [scene,...also]){s.environment=entry.env;s.environmentIntensity=intensity;s.environmentRotation.set(0,rotation,0);}
  if(background){scene.background=entry.hdr;scene.backgroundIntensity=backgroundIntensity;scene.backgroundRotation.set(0,rotation,0);}
  return entry;
}
