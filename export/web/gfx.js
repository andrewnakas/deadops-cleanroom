import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { settings, qualityTier } from './settings.js';

// Every quality number lives here: one row per tier, read by the renderer, the frame pipeline,
// the shadow setup and the texture loader. `pixels` caps the drawing buffer whatever the screen is.
export const TIER_ORDER=['low','medium','high','ultra'];
export const TIERS={
  low:   {lights:3,ratio:1,  pixels:1.3e6,post:false,msaa:0,bloom:0,  ao:false,sharpen:0,  shadow:0,   shadowLights:0,softShadows:false,tex:512, aniso:4, shafts:false},
  medium:{lights:5,ratio:1.5,pixels:2.2e6,post:true, msaa:0,bloom:.22,ao:false,sharpen:.3, shadow:1024,shadowLights:1,softShadows:false,tex:1024,aniso:8, shafts:true},
  high:  {lights:7,ratio:2,  pixels:4.2e6,post:true, msaa:4,bloom:.28,ao:true, sharpen:.4, shadow:2048,shadowLights:2,softShadows:true, tex:1024,aniso:16,shafts:true},
  ultra: {lights:9,ratio:2.5,pixels:9e6,  post:true, msaa:4,bloom:.3, ao:true, sharpen:.45,shadow:4096,shadowLights:3,softShadows:true, tex:2048,aniso:16,shafts:true},
};
// A session-only ceiling set by the frame-time watchdog (never stored: the player's choice stays theirs).
let ceiling=TIER_ORDER.length-1;
export const lowerCeiling=()=>{const now=TIER_ORDER.indexOf(currentTier.last);if(now<=0)return false;ceiling=now-1;return true;};
// 'auto' on a desktop starts from the graphics chip: integrated chips begin on medium. `?gfx=high` forces a tier.
let autoDesktop='high';const forced=new URLSearchParams(globalThis.location?.search??'').get('gfx');
export function currentTier(mobile){const t=TIERS[forced]?forced:settings.quality==='auto'&&!mobile?autoDesktop:qualityTier(mobile);return currentTier.last=TIER_ORDER[Math.min(TIER_ORDER.indexOf(t),ceiling)]??'low';}
currentTier.last='low';
export const tierInfo=mobile=>TIERS[currentTier(mobile)];
export const autoQuality=()=>settings.quality==='auto'&&!forced&&!navigator.webdriver;
export function pixelRatio(tier,w=innerWidth,h=innerHeight){const t=TIERS[tier];return Math.max(.5,Math.min(devicePixelRatio,t.ratio,Math.sqrt(t.pixels/Math.max(1,w*h))));}

export function createRenderer(profile,{exposure=1.1}={}){
  const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile,powerPreference:profile.mobile?'default':'high-performance'});
  renderer.userData={};
  try{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),chip=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'';
    if(/Intel|UHD|HD Graphics|Iris|SwiftShader|llvmpipe|Mali|Adreno|PowerVR|Microsoft Basic/i.test(chip)&&!/Arc\(TM\)|Arc A\d|Arc B\d/i.test(chip))autoDesktop='medium';renderer.userData.chip=chip;}catch{}
  const tier=currentTier(profile.mobile);
  renderer.setPixelRatio(pixelRatio(tier));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=exposure;renderer.autoClear=false;
  Object.assign(renderer.userData,{mobile:profile.mobile,anisotropy:Math.min(TIERS[tier].aniso,renderer.capabilities.getMaxAnisotropy())});
  document.body.prepend(renderer.domElement);
  return renderer;
}

// Image-based lighting from an equirectangular HDR: reflections and soft fill for every PBR material.
// `background` also shows it as the sky. Scenes listed in `also` (the weapon scene) share the light.
const envCache=new Map();
// Light rigs that go with each environment image: moon direction (matched to the picture by eye),
// colours and how strongly the image lights the scene.
export const ENVIRONMENTS={
  sky_clear:   {moon:[-.55,.62,.35],moonColor:0xa9c2ff,moonPower:1.5,env:1.5,sky:.5, hemi:[0x6f86c0,0x2a3326,.7],fog:[0x141c30,1800,5200],rotation:0},
  sky_overcast:{moon:[.4,.7,-.45],  moonColor:0xb8c4d8,moonPower:1.1,env:1.2,sky:.32,hemi:[0x7a88a0,0x2c2f2a,.7], fog:[0x1a2028,1300,4400],rotation:0},
  sky_moonrise:{moon:[.7,.36,.5],   moonColor:0xffd9b0,moonPower:1.7,env:1.3,sky:.5, hemi:[0x8088b0,0x3a3028,.65], fog:[0x1c2030,1700,5000],rotation:0},
  interior:    {env:.16,rotation:0},
};
export async function loadEnvironment(renderer,scene,url,{background=false,intensity=1,backgroundIntensity=1,rotation=0,also=[],alsoIntensity=1}={}){
  let entry=envCache.get(url);
  if(!entry){
    const hdr=await new HDRLoader().setDataType(THREE.FloatType).loadAsync(url);hdr.mapping=THREE.EquirectangularReflectionMapping;
    // A moon or lamp in the picture is thousands of times brighter than the rest: cap it, or every glossy surface mirrors a white blot.
    const px=hdr.image.data;for(let i=0;i<px.length;i++)if(px[i]>6)px[i]=6;hdr.needsUpdate=true;
    const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromEquirectangular(hdr).texture;pmrem.dispose();
    envCache.set(url,entry={hdr,env});
  }
  for(const s of [scene,...also]){s.environment=entry.env;s.environmentIntensity=s===scene?intensity:alsoIntensity;s.environmentRotation.set(0,rotation,0);}
  if(background){
    const sky=typeof background==='string'?await new THREE.TextureLoader().loadAsync(background).then(t=>{t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;return t;}).catch(()=>entry.hdr):entry.hdr;
    scene.background=sky;scene.backgroundIntensity=backgroundIntensity;scene.backgroundRotation.set(0,rotation,0);
  }
  return entry;
}
