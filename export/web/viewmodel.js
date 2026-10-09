import * as THREE from 'three';
import { loadAsset, instance } from './models.js';
import { bottle } from './props.js';

// First-person weapon: CC0 gun model held by procedural arms. Every pose (raise,
// fire, reload, sprint, aim, knife, drink) is animated in code, so no clip data is needed.
const ease=t=>t*t*(3-2*t);
const sleeve=new THREE.MeshStandardMaterial({color:0x3b4334,roughness:.9}),skin=new THREE.MeshStandardMaterial({color:0xc69a7a,roughness:.7}),glove=new THREE.MeshStandardMaterial({color:0x2a2622,roughness:.8});
function arm(){
  const g=new THREE.Group(),fore=new THREE.Mesh(new THREE.CylinderGeometry(.03,.038,.3,10),sleeve);fore.rotation.x=Math.PI/2;fore.position.z=.17;
  const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.036,.036,.03,10),skin);cuff.rotation.x=Math.PI/2;cuff.position.z=.03;
  const hand=new THREE.Mesh(new THREE.BoxGeometry(.06,.05,.09),glove);hand.position.z=-.02;g.add(fore,cuff,hand);return g;
}
export class ViewModel {
  constructor(scene,data,audio){
    this.scene=scene;this.data=data;this.audio=audio;this.pivot=new THREE.Group();scene.add(this.pivot);
    this.holder=new THREE.Group();this.pivot.add(this.holder);
    this.right=arm();this.left=arm();this.holder.add(this.right,this.left);
    this.knife=new THREE.Group();const blade=new THREE.Mesh(new THREE.BoxGeometry(.012,.03,.2),new THREE.MeshStandardMaterial({color:0xcfd4d8,metalness:.9,roughness:.25}));blade.position.z=-.12;
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.022,.032,.1),glove);this.knife.add(blade,grip);this.knife.visible=false;this.pivot.add(this.knife);
    this.axeModel=null;this.bottle=null;this.token=0;this.currentId=null;this.ready=false;this.mode='idle';
    this.t=0;this.modeTime=0;this.modeDuration=0;this.recoil=0;this.aim=0;this.sprintBlend=0;this.meleeLeft=0;this.drinkColor=null;
  }
  async load(){try{this.axeAsset=await loadAsset('models/axe.glb');}catch{}}
  async equip(def){
    const key=def.id+(def.upgraded?':up':'');if(this.currentId===key&&this.ready)return;this.currentId=key;this.ready=false;const token=++this.token;
    const asset=await loadAsset(def.view.model);if(token!==this.token)return;
    this.gun?.removeFromParent();
    const gun=instance(asset,def.view.length*.85,'max'),b=gun.userData.bounds;
    // CC0 gun models point down +X; turn them to -Z (away from the camera) and centre the grip.
    gun.userData.inner.position.set(-(b.min.x+b.max.x)/2,-(b.min.y+b.max.y)/2,-(b.min.z+b.max.z)/2);
    const wrap=new THREE.Group();wrap.add(gun);wrap.rotation.y=Math.PI/2;
    if(def.upgraded)gun.traverse(o=>{if(o.isMesh)o.material=[o.material].flat().map(m=>{const c=m.clone();c.emissive=new THREE.Color(0x3a1060);c.emissiveIntensity=.8;c.color.lerp(new THREE.Color(0x8a5cff),.35);return c;});});
    this.gun=wrap;this.holder.add(wrap);this.def=def;
    const L=def.view.length;this.right.position.set(.01,-.05,L*.12);this.left.position.set(-.035,-.03,-L*.32);this.left.rotation.set(.55,-.5,0);this.right.rotation.set(.7,.3,0);
    this.base=new THREE.Vector3(def.view.offset[0],def.view.offset[1],def.view.offset[2]*1.3);this.adsPos=new THREE.Vector3(0,-.055-(def.view.offset[1]+.13)*.2,def.view.offset[2]+.06);
    this.setMode('raise',.45);this.ready=true;this.pivot.visible=true;
  }
  setMode(mode,duration=0){this.mode=mode;this.modeTime=0;this.modeDuration=duration;}
  shoot({ads=false}={}){if(!this.ready||this.meleeLeft>0)return;this.recoil=1;if(this.mode==='idle'||this.mode==='fire')this.setMode('fire',.12);}
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
  update(dt,{moving=false,sprint=false,ads=false,reloading=false,time=0}={}){
    if(!this.ready)return;
    this.t+=dt;this.modeTime+=dt;this.meleeLeft=Math.max(0,this.meleeLeft-dt);
    const k=this.modeDuration>0?Math.min(1,this.modeTime/this.modeDuration):1;
    if(['raise','fire','melee'].includes(this.mode)&&k>=1){if(this.mode==='melee'){this.knife.visible=false;if(this.axeModel)this.axeModel.visible=false;}this.setMode('idle');}
    if(['reload','shell','pump'].includes(this.mode)&&!reloading)this.setMode('idle');
    const aiming=ads&&['idle','fire'].includes(this.mode);
    this.aim=THREE.MathUtils.clamp(this.aim+(aiming?dt/.18:-dt/.15),0,1);
    this.recoil=Math.max(0,this.recoil-dt*9);
    this.sprintBlend=THREE.MathUtils.damp(this.sprintBlend,sprint&&this.mode==='idle'?1:0,10,dt);
    const p=this.base.clone().lerp(this.adsPos,ease(this.aim)),r=new THREE.Euler(.03*(1-this.aim),-.09*(1-this.aim),0);
    const bob=moving&&this.mode!=='melee'?(1-this.aim*.85):0,speed=sprint?13:9;
    p.x+=Math.sin(time*speed)*.008*bob;p.y+=Math.abs(Math.cos(time*speed))*.008*bob+Math.sin(this.t*1.6)*.002;
    p.z+=this.recoil*.045;r.x+=this.recoil*.09;
    p.x+=this.sprintBlend*-.04;p.y-=this.sprintBlend*.03;r.y+=this.sprintBlend*.75;r.x-=this.sprintBlend*.25;
    if(this.mode==='raise'){const u=1-ease(k);p.y-=u*.25;r.x-=u*.6;}
    if(this.mode==='reload'){const u=Math.sin(k*Math.PI);p.y-=u*.07;r.x-=u*.35;r.z+=u*.55;this.left.position.y=-.03-u*.09*(k<.5?1:0);}else this.left.position.y=-.03;
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
