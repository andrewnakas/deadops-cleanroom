import * as THREE from 'three';
import { loadAsset, instance, refineGun } from './models.js';
import { bottle } from './props.js';
import { flashTexture } from './fx.js';

// First-person weapon: CC0 gun model held by procedural arms. Every pose (raise,
// fire, reload, sprint, aim, knife, drink) is animated in code, so no clip data is needed.
const ease=t=>t*t*(3-2*t);
// Arm materials: a woven field-jacket sleeve, a stitched leather glove with a hard knuckle guard.
const weave=(()=>{const t=new THREE.TextureLoader().load('textures-mobile/velvet_normal.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,7);return t;})();
const sleeve=new THREE.MeshStandardMaterial({color:0x20241c,roughness:.95,normalMap:weave,normalScale:new THREE.Vector2(1.6,1.6),envMapIntensity:.4}),skin=new THREE.MeshStandardMaterial({color:0xb98a6c,roughness:.62});
const glove=new THREE.MeshStandardMaterial({color:0x0f0e0d,roughness:.82,normalMap:weave,normalScale:new THREE.Vector2(.5,.5),envMapIntensity:.35}),guard=new THREE.MeshStandardMaterial({color:0x161718,roughness:.5,metalness:.2,envMapIntensity:.5}),strapMat=new THREE.MeshStandardMaterial({color:0x14120f,roughness:.5});
const lathe=(pts,seg=22)=>{const g=new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),seg);g.rotateX(-Math.PI/2);return g;};
function arm(){
  const g=new THREE.Group();
  // forearm: wrist at z=.03 swelling to the elbow at z=.36, with a gathered cuff
  const fore=new THREE.Mesh(lathe([[.0,.028],[.03,.03],[.032,.06],[.037,.12],[.043,.2],[.046,.28],[.044,.36],[.0,.37]]),sleeve);fore.scale.set(1,.9,-1);
  const cuff=new THREE.Mesh(lathe([[.031,.0],[.0345,.004],[.0355,.016],[.0345,.03],[.031,.034]]),sleeve);cuff.scale.set(1,.9,-1);cuff.position.z=.022;
  const wrist=new THREE.Mesh(new THREE.CylinderGeometry(.026,.029,.03,18),skin);wrist.rotation.x=Math.PI/2;wrist.scale.x=1.12;wrist.position.z=.018;
  const strap=new THREE.Mesh(new THREE.CylinderGeometry(.0305,.0305,.016,20),strapMat);strap.rotation.x=Math.PI/2;strap.scale.x=1.1;strap.position.z=.012;
  // hand: rounded palm, a knuckle guard, four two-joint fingers curled round the grip and a thumb
  const palm=new THREE.Mesh(new THREE.SphereGeometry(.5,20,14),glove);palm.scale.set(.062,.028,.08);palm.position.set(0,-.002,-.024);
  const plate=new THREE.Mesh(new THREE.SphereGeometry(.5,16,10,0,Math.PI*2,0,Math.PI/2),guard);plate.scale.set(.054,.012,.026);plate.position.set(-.001,.011,-.05);
  const fingers=new THREE.Group();
  for(let i=0;i<4;i++){
    const len=[.03,.034,.032,.026][i],f=new THREE.Group();f.position.set(-.0225+i*.015,-.006,-.058);f.rotation.x=1.05;
    const a=new THREE.Mesh(new THREE.CapsuleGeometry(.0064,len,5,10),glove);a.rotation.x=Math.PI/2;a.position.z=-len/2;
    const j=new THREE.Group();j.position.z=-len-.004;j.rotation.x=1.25;
    const b=new THREE.Mesh(new THREE.CapsuleGeometry(.0058,len*.8,5,10),glove);b.rotation.x=Math.PI/2;b.position.z=-len*.4;j.add(b);f.add(a,j);fingers.add(f);
  }
  const thumb=new THREE.Group();thumb.position.set(.031,-.004,-.022);thumb.rotation.set(.35,-.75,0);
  const t1=new THREE.Mesh(new THREE.CapsuleGeometry(.0074,.026,5,10),glove);t1.rotation.x=Math.PI/2;t1.position.z=-.014;
  const t2=new THREE.Mesh(new THREE.CapsuleGeometry(.0066,.02,5,10),glove);t2.rotation.x=Math.PI/2;t2.position.set(0,-.004,-.04);t2.rotation.z=.2;thumb.add(t1,t2);
  g.add(fore,cuff,wrist,strap,palm,plate,fingers,thumb);g.userData.fingers=fingers;return g;
}
export class ViewModel {
  constructor(scene,data,audio){
    this.scene=scene;this.data=data;this.audio=audio;this.pivot=new THREE.Group();scene.add(this.pivot);
    this.holder=new THREE.Group();this.pivot.add(this.holder);
    this.right=arm();this.left=arm();this.holder.add(this.right,this.left);
    this.knife=new THREE.Group();const blade=new THREE.Mesh(new THREE.BoxGeometry(.012,.03,.2),new THREE.MeshStandardMaterial({color:0xcfd4d8,metalness:.9,roughness:.25}));blade.position.z=-.12;
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.022,.032,.1),strapMat);this.knife.add(blade,grip);this.knife.visible=false;this.pivot.add(this.knife);
    this.flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTexture(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false}));this.flash.visible=false;this.flash.renderOrder=5;this.holder.add(this.flash);
    this.flashLight=new THREE.PointLight(0xffc276,0,3,2);this.holder.add(this.flashLight);this.flashLeft=0;
    this.mag=new THREE.Mesh(new THREE.BoxGeometry(.022,.07,.04),new THREE.MeshStandardMaterial({color:0x1b1c1e,roughness:.5,metalness:.4}));this.mag.visible=false;this.holder.add(this.mag);
    this.swayX=0;this.swayY=0;this.dip=0;this.roll=0;
    this.axeModel=null;this.bottle=null;this.token=0;this.currentId=null;this.ready=false;this.mode='idle';
    this.t=0;this.modeTime=0;this.modeDuration=0;this.recoil=0;this.aim=0;this.sprintBlend=0;this.meleeLeft=0;this.drinkColor=null;
  }
  async load(){try{this.axeAsset=await loadAsset('models/axe.glb');}catch{}}
  async equip(def){
    const key=def.id+(def.upgraded?':up':'');if(this.currentId===key&&this.ready)return;this.currentId=key;this.ready=false;const token=++this.token;
    const asset=await loadAsset(def.view.model);if(token!==this.token)return;
    this.gun?.removeFromParent();refineGun(asset);
    const gun=instance(asset,def.view.length*.85,'max'),b=gun.userData.bounds;
    // CC0 gun models point down +X; turn them to -Z (away from the camera) and centre the grip.
    gun.userData.inner.position.set(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-(b.min.z+b.max.z)/2);
    const wrap=new THREE.Group();wrap.add(gun);wrap.rotation.y=Math.PI/2;
    if(def.upgraded)gun.traverse(o=>{if(o.isMesh)o.material=[o.material].flat().map(m=>{const c=m.clone();c.emissive=new THREE.Color(0x3a1060);c.emissiveIntensity=.8;c.color.lerp(new THREE.Color(0x8a5cff),.35);return c;});});
    this.gun=wrap;this.holder.add(wrap);this.def=def;
    const L=def.view.length;this.right.position.set(.01,-.05,L*.12);this.left.position.set(-.035,-.03,-L*.32);this.left.rotation.set(.55,-.5,0);this.right.rotation.set(.7,.3,0);
    this.base=new THREE.Vector3(def.view.offset[0],def.view.offset[1],def.view.offset[2]*1.3);this.adsPos=new THREE.Vector3(0,-.055-(def.view.offset[1]+.13)*.2,def.view.offset[2]+.06);
    this.tip=new THREE.Vector3(0,.012,-L*.46);this.flash.position.copy(this.tip);this.flashLight.position.copy(this.tip);this.flashSize=def.class==='shotgun'||def.class==='sniper'||def.class==='magnum'?.22:def.class==='pistol'?.13:.16;
    this.setMode('raise',.45);this.ready=true;this.pivot.visible=true;
  }
  setMode(mode,duration=0){this.mode=mode;this.modeTime=0;this.modeDuration=duration;}
  shoot({ads=false}={}){if(!this.ready||this.meleeLeft>0)return;this.recoil=1;if(this.mode==='idle'||this.mode==='fire'||this.mode==='inspect')this.setMode('fire',.12);
    if(this.def.class!=='energy'&&!this.def.suppressed){this.flashLeft=.05;this.flash.visible=true;this.flash.scale.setScalar(this.flashSize*(.8+Math.random()*.5)*(ads?.7:1));this.flash.material.rotation=Math.random()*6.3;this.flashLight.intensity=1.6;}}
  inspect(){if(this.ready&&this.mode==='idle')this.setMode('inspect',2.4);}
  // Muzzle position in view space (metres in front of the eye); callers scale it into the world.
  tipOffset(){return this.tip?this.holder.localToWorld(this.tip.clone()):new THREE.Vector3(0,-.1,-.5);}
  land(strength=1){this.dip=Math.min(1,this.dip+strength);}
  reload(empty,duration,stage='magazine'){if(!this.ready)return;this.aim=0;this.setMode(stage==='shell'?'shell':stage==='start'||stage==='end'?'pump':'reload',duration);}
  melee(type='knife',charge=false){
    if(!this.ready||this.meleeLeft>0)return null;const axe=type==='axe';
    const duration=charge?.75:.5;this.meleeType=type;this.meleeLeft=duration;this.setMode('melee',duration);this.aim=0;
    if(axe&&this.axeAsset&&!this.axeModel){this.axeModel=instance(this.axeAsset,.42,'max');this.axeModel.rotation.set(-Math.PI/2,0,0);this.pivot.add(this.axeModel);}
    this.knife.visible=!axe;if(this.axeModel)this.axeModel.visible=axe;
    return {duration,delay:charge?.22:this.data.knife.delay,damage:axe?this.data.axe.damage:this.data.knife.damage};
  }
  drink(color,duration){
    if(!this.bottle){this.bottle=bottle(color);this.bottle.scale.setScalar(.012);this.pivot.add(this.bottle);}
    this.bottle.traverse(o=>{if(o.isMesh&&o.material.transparent)o.material.color.set(color);});
    this.setMode('drink',duration);this.bottle.visible=true;
  }
  stopDrink(){if(this.bottle)this.bottle.visible=false;if(this.mode==='drink')this.setMode('raise',.4);}
  update(dt,{moving=false,sprint=false,ads=false,reloading=false,time=0,strafe=0,lookX=0,lookY=0,air=false,sliding=false,quiet=false}={}){
    if(!this.ready)return;
    if(this.flashLeft>0){this.flashLeft-=dt;if(this.flashLeft<=0){this.flash.visible=false;this.flashLight.intensity=0;}}
    this.swayX=THREE.MathUtils.damp(this.swayX,THREE.MathUtils.clamp(lookX,-1,1),8,dt);this.swayY=THREE.MathUtils.damp(this.swayY,THREE.MathUtils.clamp(lookY,-1,1),8,dt);
    this.dip=THREE.MathUtils.damp(this.dip,0,7,dt);this.roll=THREE.MathUtils.damp(this.roll,(sliding?-.5:0)+THREE.MathUtils.clamp(strafe,-1,1)*.05,8,dt);
    this.t+=dt;this.modeTime+=dt;this.meleeLeft=Math.max(0,this.meleeLeft-dt);
    const k=this.modeDuration>0?Math.min(1,this.modeTime/this.modeDuration):1;
    if(['raise','fire','melee','inspect'].includes(this.mode)&&k>=1){if(this.mode==='melee'){this.knife.visible=false;if(this.axeModel)this.axeModel.visible=false;}this.setMode('idle');}
    if(['reload','shell','pump'].includes(this.mode)&&!reloading)this.setMode('idle');
    const aiming=ads&&['idle','fire'].includes(this.mode);
    this.aim=THREE.MathUtils.clamp(this.aim+(aiming?dt/.18:-dt/.15),0,1);
    this.recoil=Math.max(0,this.recoil-dt*9);
    this.sprintBlend=THREE.MathUtils.damp(this.sprintBlend,sprint&&this.mode==='idle'?1:0,10,dt);
    const p=this.base.clone().lerp(this.adsPos,ease(this.aim)),r=new THREE.Euler(.03*(1-this.aim),-.09*(1-this.aim),0);
    const bob=moving&&!air&&!sliding&&!quiet&&this.mode!=='melee'?(1-this.aim*.85):0,speed=sprint?13:9;
    p.x-=this.swayX*.012*(1-this.aim*.7);p.y+=this.swayY*.01*(1-this.aim*.7)-this.dip*.035+(air?.012:0);r.y+=this.swayX*.035*(1-this.aim*.6);r.x+=this.swayY*.03*(1-this.aim*.6)+this.dip*.06;r.z+=this.roll*(1-this.aim*.5);
    p.x+=Math.sin(time*speed)*.008*bob;p.y+=Math.abs(Math.cos(time*speed))*.008*bob+Math.sin(this.t*1.6)*.002;
    p.z+=this.recoil*.045;r.x+=this.recoil*.09;
    p.x+=this.sprintBlend*-.04;p.y-=this.sprintBlend*.03;r.y+=this.sprintBlend*.75;r.x-=this.sprintBlend*.25;
    if(this.mode==='raise'){const u=1-ease(k);p.y-=u*.25;r.x-=u*.6;}
    if(this.mode==='reload'){const u=Math.sin(k*Math.PI);p.y-=u*.07;r.x-=u*.35;r.z+=u*.55;this.left.position.y=-.03-u*.09*(k<.5?1:0);
      // the spent magazine drops away with the support hand and a fresh one comes back up
      const out=k<.2?0:k<.45?(k-.2)/.25:k<.6?1:k<.85?1-(k-.6)/.25:0;this.mag.visible=!this.def.segmentedReload&&this.def.class!=='energy'&&out>0;this.mag.position.set(0,-.05-out*.14,-this.def.view.length*.05);this.mag.rotation.z=out*.5;}
    else{this.left.position.y=-.03;this.mag.visible=false;}
    if(this.mode==='inspect'){const u=Math.sin(k*Math.PI),w=Math.sin(k*Math.PI*2);p.x-=u*.05;p.y+=u*.03;r.y+=u*.9+w*.25;r.z+=u*.5;r.x+=w*.12;}
    if(this.mode==='shell'){const u=Math.sin(k*Math.PI);r.z+=.35;p.y-=.03;this.left.position.y=-.03-u*.06;}
    if(this.mode==='pump'){const u=Math.sin(k*Math.PI);r.z+=.25*u;this.left.position.z=-this.def.view.length*.32+u*.06;}else this.left.position.z=-this.def.view.length*.32;
    if(this.mode==='melee'){const u=k<.35?ease(k/.35):1-ease((k-.35)/.65);p.y-=u*.2;p.x-=u*.05;r.x-=u*.4;
      const blade=this.meleeType==='axe'?this.axeModel:this.knife;if(blade){blade.position.set(.12-u*.22,-.1+u*.02,-.3-u*.1);blade.rotation.set(-.2,0,1.2-u*2.4);}}
    if(this.mode==='drink'){const u=k<.25?ease(k/.25):k>.8?1-ease((k-.8)/.2):1;p.y-=.35*Math.min(1,u*2);
      if(this.bottle){this.bottle.position.set(.05,-.22+u*.14,-.28+u*.1);this.bottle.rotation.set(u*1.1,0,0);}}
    this.holder.position.copy(p);this.holder.rotation.copy(r);
  }
  snapshot(){return {ready:this.ready,id:this.currentId,mode:this.mode,aim:this.aim,melee:this.meleeType,meleeLeft:this.meleeLeft};}
}
