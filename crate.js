import * as THREE from 'three';
import { loadAsset, instance } from './models.js';
import { mothFigure, drummerToy } from './props.js';

// The Lucky Crate: pay, watch the weapons cycle, take the one it lands on.
// After a few uses a moth may fly out instead, and the crate relocates.
const cycleTime=3.9,offerTime=12;
export class LuckyCrate {
  constructor(scene,world,data,session,audio,toast){Object.assign(this,{scene,world,data,session,audio,toast});this.boxes=new Map();this.models={};this.moves=0;this.uses=0;}
  async load(){
    await Promise.all(this.data.boxPool.filter(id=>this.data.weapons[id]).map(async id=>{const d=this.data.weapons[id];this.models[id]=instance(await loadAsset(d.view.model),Math.max(16,d.view.length*60),'max');}));
    this.models.drummer=drummerToy();this.models.drummer.scale.setScalar(1.6);this.models.moth=mothFigure();this.models.moth.scale.setScalar(1.4);
    for(const [k,m] of Object.entries(this.models)){const b=new THREE.Box3().setFromObject(m,true),c=b.getCenter(new THREE.Vector3());const w=new THREE.Group();m.position.sub(c);w.add(m);this.models[k]=w;}
    for(const c of this.world.crates){
      const display=new THREE.Group();display.position.copy(c.position);display.rotation.y=c.yaw+Math.PI/2;this.scene.add(display);
      const glow=new THREE.Mesh(new THREE.PlaneGeometry(52,22),new THREE.MeshBasicMaterial({color:0xd8eaff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));glow.rotation.x=-Math.PI/2;glow.position.y=23;glow.rotation.z=Math.PI/2;display.add(glow);
      this.boxes.set(c.id,{id:c.id,crate:c,lid:c.lid,display,glow,roll:null,opening:0,closing:0,shown:null,wrapper:null});
    }
  }
  available(c){const b=this.boxes.get(c.id);return !!b&&(c===this.world.activeBox||this.world.clearanceSale||!!b.roll);}
  at(c){return this.boxes.get(c.id)?.roll;}
  start(c){
    const b=this.boxes.get(c.id);if(!b||b.roll||b.closing)return false;
    const sale=this.session.effects.clearance>this.session.time;
    const pool=this.data.boxPool.filter(k=>this.models[k]&&!this.session.inventory.some(w=>w.id===k&&!w.lost)&&!(k==='drummer'&&this.session.drummersOwned));
    if(!pool.length)return false;
    if(!sale)this.uses++;
    const chance=this.uses<4?0:this.uses<8?.15:!this.moves?1:this.uses<13?.3:.5;
    const moth=!sale&&this.world.crates.length>1&&this.session.random()<chance;
    b.roll={weapon:pool[Math.floor(this.session.random()*pool.length)],ready:false,time:this.session.time+cycleTime,expires:this.session.time+cycleTime+offerTime,started:this.session.time,sale,moth,pool};
    b.opening=0;this.world.openBoxes.add(b.id);this.world.updateBox();this.audio.play('crate');return true;
  }
  take(c){const b=this.boxes.get(c.id);if(!b?.roll?.ready||b.roll.moth)return null;const weapon=b.roll.weapon;this.close(b);return weapon;}
  show(b,id){
    if(b.shown===id)return;b.wrapper?.removeFromParent();b.shown=id;const m=this.models[id];if(!m){b.wrapper=null;return;}
    b.wrapper=new THREE.Group();b.wrapper.add(m.clone(true));b.display.add(b.wrapper);
  }
  close(b){b.roll=null;b.closing=.5;b.wrapper?.removeFromParent();b.wrapper=null;b.shown=null;}
  name(id){return this.data.weapons[id]?.name??this.data.equipment[id]?.name??id;}
  update(dt){
    const sale=this.session.effects.clearance>this.session.time;
    if(this.world.clearanceSale!==sale){this.world.clearanceSale=sale;this.world.updateBox();}
    for(const b of this.boxes.values()){
      if(b.roll){
        const r=b.roll,age=this.session.time-r.started;b.opening=Math.min(.5,b.opening+dt);
        if(this.session.time>=r.time&&!r.ready){r.ready=true;this.show(b,r.moth?'moth':r.weapon);this.toast(r.moth?'A moth flutters out… the crate is leaving':this.name(r.weapon)+' — press F to take',4);
          if(r.moth){this.session.points+=this.data.crate.price;this.audio.play('crate_gone');}}
        if(!r.ready){const step=age<1?Math.floor(age/.05):age<2?20+Math.floor((age-1)/.1):age<3?30+Math.floor((age-2)/.2):35+Math.floor((age-3)/.3);this.show(b,r.pool[step%r.pool.length]);}
        if(b.wrapper){const sink=THREE.MathUtils.clamp((this.session.time-r.time)/offerTime,0,1);b.wrapper.position.y=r.moth&&r.ready?36+Math.max(0,this.session.time-r.time-1)*80:r.ready?36*(1-sink*sink*(3-2*sink))+16:Math.min(52,16+age/3*36);b.wrapper.rotation.y=r.moth?this.session.time*4:0;}
        if(r.moth&&this.session.time>r.time+5){this.close(b);this.moves++;this.uses=0;const choices=this.world.crates.filter(c=>c!==this.world.activeBox);this.world.activeBox=choices[Math.floor(this.session.random()*choices.length)];this.world.updateBox();this.toast('The Lucky Crate has moved');}
        else if(this.session.time>r.expires)this.close(b);
      }
      if(b.closing){b.closing=Math.max(0,b.closing-dt);b.opening=b.closing;if(!b.closing){this.world.openBoxes.delete(b.id);this.world.updateBox();}}
      const t=b.opening/.5;b.lid.rotation.x=-ease(t)*1.8;b.glow.material.opacity=t*.25;
    }
  }
  reset(){for(const b of this.boxes.values()){b.roll=null;b.opening=b.closing=0;b.wrapper?.removeFromParent();b.wrapper=null;b.shown=null;b.lid.rotation.x=0;b.glow.material.opacity=0;}this.moves=this.uses=0;}
  snapshot(){return [...this.boxes.values()].map(b=>({id:b.id,open:b.opening/.5,shown:b.shown,roll:b.roll?{weapon:b.roll.weapon,ready:b.roll.ready,moth:b.roll.moth,time:b.roll.time,expires:b.roll.expires}:null}));}
}
const ease=t=>t*t*(3-2*t);
