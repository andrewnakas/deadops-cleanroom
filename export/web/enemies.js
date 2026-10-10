import * as THREE from 'three';
import { loadAsset, instance, ClipRig } from './models.js';
import { zombieHealth } from './rules.js';
import { disposeSkeletons } from './runtime-assets.js';

// Undead: CC0 Quaternius zombies and wolves (assets/LICENSES.csv) driven by navmesh AI.
const ZOMBIES=[{url:'models/zombie_a.glb',walk:'Walk',run:'Run',sprint:'Run_Arms',attack:'Punch',death:'Death',crawl:'Crawl',tint:0x9fb08a},
  {url:'models/zombie_b.glb',walk:'Walk',run:'Run',sprint:'Run',attack:'Attack',death:'Death',tint:0xb0a490}];
const HOUND={url:'models/wolf_b.glb',walk:'Gallop',run:'Gallop',sprint:'Gallop',attack:'Attack',death:'Death',tint:0x3a2a26};
export class Enemies {
  constructor(scene,world,data,session,{damage,kill,hit,sound}){Object.assign(this,{scene,world,data,session,onDamage:damage,onKill:kill,onHit:hit,onSound:sound});this.list=[];this.dead=[];this.nextSpawn=0;this.serial=0;this.templates=[];this.anims={};}
  async load(){
    this.types=await Promise.all(ZOMBIES.map(async t=>({...t,asset:await loadAsset(t.url)})));
    this.hound={...HOUND,asset:await loadAsset(HOUND.url)};
  }
  spawn(position=null,barrier=null,kind=this.session.dogRound?'dog':'zombie'){
    const id=++this.serial,root=new THREE.Group();root.name=kind+'_'+id;
    const type=kind==='dog'?this.hound:kind==='nova'?this.types[0]:this.types[id%this.types.length];
    const model=instance(type.asset,kind==='dog'?34:kind==='nova'?70:66+(id%5)*2.5,'y');
    model.rotation.y=Math.PI/2;
    model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=true;const tint=kind==='nova'?0x8fd06a:type.tint;o.material=[o.material].flat().map(m=>{const c=m.clone();c.color.multiply(new THREE.Color(tint));if(kind==='dog'){c.emissive=new THREE.Color(0x401008);}return c;});if(o.material.length===1)o.material=o.material[0];}});
    root.add(model);root.position.copy(position??barrier.outside);this.scene.add(root);
    const rig=new ClipRig(model,type.asset.clips),round=this.session.round;
    const speed=kind==='dog'?230:kind==='nova'?Math.min(120,40+round*5):Math.min(210,34+round*8+(id%4)*5);
    const gait=kind==='nova'?type.crawl:speed<70?type.walk:speed<150?type.run:type.sprint;
    rig.map('walk',gait);rig.map('attack',type.attack);rig.map('death',type.death);
    const pace=kind==='dog'?1.1:kind==='nova'?speed/60:gait===type.walk?speed/45:speed/150;
    rig.play('walk',true,pace,0);rig.update(Math.random());
    const z={id,kind,root,model,rig,pace,speed,health:kind==='dog'?([400,900,1300,1600][Math.min(3,Math.max(0,this.session.dogRounds-1))]):zombieHealth(round,this.data.rules),state:barrier?'barricade':'chase',barrier,path:[],pathIndex:0,repath:0,attackLeft:0,attackDealt:false,tearLeft:1.1,stuck:0,lastPosition:root.position.clone(),growl:3+id%7};
    if(kind==='nova')z.health=Math.trunc(z.health*.75);
    z.maxHealth=z.health;this.list.push(z);this.session.spawned++;return z;
  }
  update(dt,player){
    const s=this.session;
    if(this.autoSpawn!==false&&s.phase==='fighting'&&s.spawned<s.total&&this.list.length<24){
      this.nextSpawn-=dt;
      if(this.nextSpawn<=0){
        const near=this.spawnNear?.()??player,candidates=this.world.spawnBarriers(s).filter(b=>{const p=this.world.path(b.inside,near);return p.length>1&&p.at(-1).distanceTo(near)<150;});
        if(candidates.length){
          const b=candidates[Math.floor(s.random()*candidates.length)],nova=s.power&&!s.dogRound&&s.spawned%5===4&&['lobby','auditorium','alley'].includes(this.world.zoneAt(near.clone().add(new THREE.Vector3(0,35,0))));
          this.spawn(s.dogRound||nova?b.inside:null,s.dogRound||nova?null:b,s.dogRound?'dog':nova?'nova':'zombie');
          this.nextSpawn=Math.max(.35,(this.data.rules.zombie_spawn_delay??2)*Math.pow(.95,s.round-1));
        }
        else this.nextSpawn=1;
      }
    }
    for(const z of [...this.list]){
      z.rig.update(dt);z.growl-=dt;
      if(z.growl<0){this.onSound?.('growl',z.root.position);z.growl=6+s.random()*7;}
      if(z.state==='barricade'){
        z.root.rotation.y=Math.atan2(-(z.barrier.inside.z-z.root.position.z),z.barrier.inside.x-z.root.position.x);
        z.tearLeft-=dt;
        if(z.barrier.count>0){z.rig.play('attack',true,1.2);if(z.tearLeft<=0){this.world.setBoards(z.barrier,z.barrier.count-1);z.tearLeft=1.1;this.onSound?.('board',z.root.position);}}
        else{z.state='entering';z.enterFrom=z.root.position.clone();z.enterTime=0;z.rig.play('walk',true,z.pace);}
        continue;
      }
      if(z.state==='entering'){
        z.enterTime+=dt;const t=Math.min(1,z.enterTime/1.2);z.root.position.lerpVectors(z.enterFrom,z.barrier.inside,t);z.root.position.y+=Math.sin(t*Math.PI)*12;
        if(t===1){z.state='chase';z.repath=0;}continue;
      }
      // Co-op: `pick` names the player this zombie is after; with nobody standing it waits where it is.
      const tgt=this.pick?.(z,player),pl=tgt?.pos??player,lure=this.lureTarget?.(z)??(tgt?.none?z.root.position.clone():null),goal=lure??pl;
      const dist=z.root.position.distanceTo(pl),at=z.root.position.clone().add(new THREE.Vector3(0,z.kind==='dog'?25:45,0)),eye=pl.clone().add(new THREE.Vector3(0,40,0));
      if(z.state==='attack'){
        z.attackLeft-=dt;
        if(!z.attackDealt&&z.attackLeft<.62){z.attackDealt=true;if(!lure&&dist<76&&this.world.lineClear(at,eye))this.onDamage(z.kind==='dog'?40:z.kind==='nova'?45:50,at,z,tgt?.id);}
        if(z.attackLeft<=0){z.state='chase';z.rig.play('walk',true,z.pace);}continue;
      }
      if(!lure&&dist<62&&Math.abs(z.root.position.y-pl.y)<50&&s.phase!=='reviving'&&this.world.lineClear(at,eye)){
        z.state='attack';z.attackLeft=1.15;z.attackDealt=false;z.rig.play('attack',false,Math.max(.8,z.rig.duration('attack')/1.1));continue;
      }
      z.repath-=dt;
      if(z.repath<=0){z.path=this.world.path(z.root.position,goal);z.pathIndex=1;z.repath=.55+(z.id%5)*.07;}
      const target=z.path[z.pathIndex];
      if(target){
        const delta=target.clone().sub(z.root.position),horizontal=Math.hypot(delta.x,delta.z);
        if(horizontal<10){z.pathIndex++;}
        else{
          const next=z.root.position.clone().addScaledVector(delta,Math.min(1,z.speed*dt/horizontal));
          for(const other of this.list){if(other===z||other.state==='barricade')continue;const sep=next.clone().sub(other.root.position);sep.y=0;const d=sep.length();if(d<29&&d>.01)next.addScaledVector(sep,(29-d)/d*dt*2);}
          const safe=this.world.closest(next,{x:22,y:36,z:22});
          if(safe&&safe.distanceTo(next)<38)z.root.position.copy(safe);
          z.root.rotation.y=Math.atan2(-delta.z,delta.x);
        }
      }
      z.stuck+=dt;
      if(z.stuck>12){const moved=z.lastPosition.distanceTo(z.root.position);z.lastPosition.copy(z.root.position);z.stuck=0;if(moved<5&&dist>100){z.path=[];z.repath=0;z.stuckCount=(z.stuckCount??0)+1;if(z.stuckCount>=3){this.remove(z);s.spawned--;}}else z.stuckCount=0;}
    }
    this.fade(dt);
    if(this.autoRounds!==false&&s.phase==='fighting'&&s.spawned>=s.total&&this.list.length===0){if(s.dogRound)this.onKill?.(null,'supply',this.lastDogDeath??player);s.nextRound();this.nextSpawn=0;this.lastDogDeath=null;}
  }
  fade(dt){for(const d of [...this.dead]){d.life-=dt;d.rig.update(dt);if(d.life<2)d.root.position.y-=dt*24;if(d.life<=0){d.root.removeFromParent();d.rig.dispose();disposeSkeletons(d.root);this.dead.splice(this.dead.indexOf(d),1);}}}
  // Co-op joiner: the host's snapshots place the zombies; only animation and the death fade run here.
  puppets(dt){for(const z of this.list){z.rig.update(dt);if(z.netPos){z.root.position.lerp(z.netPos,Math.min(1,dt*12));z.root.rotation.y=z.netYaw;}}this.fade(dt);}
  puppetKill(z){this.list.splice(this.list.indexOf(z),1);z.state='dead';z.life=4;z.rig.play('death',false);this.dead.push(z);}
  remove(z){z.root.removeFromParent();z.rig.dispose();disposeSkeletons(z.root);this.list.splice(this.list.indexOf(z),1);}
  hurt(z,damage,head=false,melee=false,cause='bullet',score=true){
    if(!this.list.includes(z))return;
    // Co-op joiner: show the hit now and send it; the host decides the kill and answers with the score.
    if(this.remoteHurt){z.health-=damage;this.onHit?.(z,head);this.remoteHurt(z,damage,head,melee,cause);return;}
    z.health-=this.session.effects.onehit>this.session.time?Math.max(damage,z.health):damage;
    if(!this.scorer)this.onHit?.(z,head);
    if(z.health<=0){
      if(z.kind==='dog')this.lastDogDeath=z.root.position.clone();
      if(this.scorer){this.scorer(true,head,melee);this.session.killed++;}else if(score)this.session.scoreHit(true,head,melee);else{this.session.kills++;this.session.killed++;}this.list.splice(this.list.indexOf(z),1);z.state='dead';z.life=4;z.rig.play('death',false);this.dead.push(z);z.gasDeath=z.kind==='nova'&&!melee&&cause==='bullet';this.onKill?.(z);
      if(this.dead.length>12){const old=this.dead.shift();old.root.removeFromParent();old.rig.dispose();disposeSkeletons(old.root);}
    }else if(this.scorer)this.scorer(false);else if(score)this.session.scoreHit(false);
  }
  rayHit(ray,far,ignore=null){
    let best=null;
    for(const z of this.list){
      if(ignore?.has(z))continue;
      const base=z.root.position,headPos=this.headPosition(z);
      const headPoint=ray.intersectSphere(new THREE.Sphere(headPos,z.kind==='dog'?12:10),new THREE.Vector3());
      const bodyPoint=ray.intersectBox(new THREE.Box3(base.clone().add(new THREE.Vector3(-18,4,-18)),base.clone().add(new THREE.Vector3(18,z.kind==='zombie'?58:36,18))),new THREE.Vector3());
      let head=!!headPoint;let point=headPoint??bodyPoint;if(!point)continue;
      if(headPoint&&bodyPoint&&bodyPoint.distanceTo(ray.origin)+12<headPoint.distanceTo(ray.origin)){point=bodyPoint;head=false;}
      const distance=point.distanceTo(ray.origin);if(distance>far||best&&best.distance<distance)continue;best={z,head,point,distance};
    }return best;
  }
  headPosition(z){z.root.updateMatrixWorld(true);const bone=z.kind==='dog'?null:z.root.getObjectByName('Head');return bone?bone.getWorldPosition(new THREE.Vector3()):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?63:28,0));}
  blackout(onDeath){for(const z of [...this.list]){this.list.splice(this.list.indexOf(z),1);this.session.kills++;this.session.killed++;if(z.kind==='dog')this.lastDogDeath=z.root.position.clone();z.state='dead';z.gasDeath=false;z.life=3;z.rig.play('death',false);this.dead.push(z);onDeath(z);this.onKill?.(z);}}
  reset(){for(const z of [...this.list,...this.dead]){z.root.removeFromParent();z.rig.dispose();disposeSkeletons(z.root);}this.list=[];this.dead=[];this.nextSpawn=0;this.lastDogDeath=null;}
  snapshot(){return this.list.map(z=>({id:z.id,kind:z.kind,health:z.health,state:z.state,position:z.root.position.toArray(),pathLength:z.path.length,animation:z.rig.current}));}
}
