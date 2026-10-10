import * as THREE from 'three';
import { PlayerController } from './player-controller.js';
import { World, vector } from './world.js';
import { ViewModel } from './viewmodel.js';
import { GameAudio } from './sfx.js';
import { configureAssets, assetLog } from './runtime-assets.js';
import { buildSuburb } from './maps/suburb.js';
import { loadAsset, instance, ClipRig } from './models.js';
import { Gamepad } from './gamepad.js';
import { createZombieTouch } from './zombies-touch.js';
import { Net } from './net.js';
import { loadProgress, saveProgress, grant, killAwards, levelOf, levelProgress, xpForLevel, unlockLevel, isUnlocked, legalPick, MEDALS, MAX_LEVEL } from './progress.js';

// Team deathmatch: two teams of soldiers (you + bots) on Maple Court, first to the score limit.
const $=id=>document.getElementById(id),keys=new Set(),audio=new GameAudio(),pad=new Gamepad(),params=new URLSearchParams(location.search);
const profile=configureAssets();
const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile});renderer.setPixelRatio(Math.min(devicePixelRatio,profile.mobile?1:1.5));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.autoClear=false;document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x2a3550);scene.fog=new THREE.Fog(0x2a3550,1500,4200);
scene.add(new THREE.HemisphereLight(0xc8d4f0,0x4a5a3a,2.0));const sun=new THREE.DirectionalLight(0xffc890,1.6);sun.position.set(-1,1.2,.4);scene.add(sun);
const camera=new THREE.PerspectiveCamera(78,innerWidth/innerHeight,1,9000);camera.rotation.order='YXZ';scene.add(camera);
const viewScene=new THREE.Scene(),viewCamera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,20);viewScene.add(new THREE.AmbientLight(0xd8d0c0,1.6));const vl=new THREE.DirectionalLight(0xffefc8,2.2);vl.position.set(.5,2,1);viewScene.add(vl);
const [base,mp]=await Promise.all([fetch('data/game.json').then(r=>r.json()),fetch('data/mp.json').then(r=>r.json())]);
const WEAPONS={};for(const id of [...mp.primaries,...mp.secondaries]){WEAPONS[id]={...base.weapons[id],...mp.weapons[id],id,upgrade:undefined};WEAPONS[id].fireType??=WEAPONS[id].automatic?'Full Auto':'Single Shot';}
const map=buildSuburb();
let world,player,view,ready=false,active=false,primary=false,primaryPressed=false,ads=false,mousePrimary=false,mouseAim=false,time=0,ended=false,lastRendered=0,previous=performance.now(),fps=0,frames=0,frameTime=0;
const botsOnly=params.get('bots')==='only',errors=[],soldiers=[],killfeed=[],fx=[],drones=[],strikes=[];
const score=[0,0],scanUntil=[0,0];
const lobby=[],clean=n=>String(n??'').replace(/[^\w .\-]/g,'').slice(0,14)||'Guest';let hostTeam=0,countdown=0,myReady=false,myTeam=0,lastLobby=null;
const net=new Net(),room=(params.get('join')??params.get('host')??'').toUpperCase().replace(/[^A-Z0-9]/g,''),evts=[];
let netRole=params.get('join')?'client':params.get('host')?'host':'solo',snapT=0,sendT=0,myId=-1;
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const saved=(()=>{try{return JSON.parse(localStorage.getItem('graveshift.class')||'{}');}catch{return {};}})();
const loadout={primary:saved.primary??'halvard',secondary:saved.secondary??'warden',perks:saved.perks??['fleetfoot','steady','hardline'],difficulty:params.get('diff')??saved.difficulty??'regular',size:+(params.get('size')??saved.size??6)};
// Local progression: XP, levels and unlocks live in this browser only.
const prof=loadProgress(),matchAwards={xp:0,medals:{},startLevel:levelOf(prof.xp)};let lastKillT=-99,chainN=0,lastKiller=null,opened=false,popUntil=0;
loadout.primary=legalPick(mp.unlocks,mp.primaries,loadout.primary,matchAwards.startLevel);loadout.secondary=legalPick(mp.unlocks,mp.secondaries,loadout.secondary,matchAwards.startLevel);
loadout.perks=mp.perks.map((slot,i)=>legalPick(mp.unlocks,slot.map(p=>p.id),loadout.perks[i],matchAwards.startLevel));
function award(list){
  if(botsOnly)return;const r=grant(prof,list);matchAwards.xp+=r.xp;for(const a of list)if(MEDALS[a])matchAwards.medals[a]=(matchAwards.medals[a]??0)+1;saveProgress(prof);
  $('xp-pop').textContent='+'+r.xp+list.filter(a=>MEDALS[a]).map(a=>' · '+MEDALS[a]).join('');popUntil=performance.now()+1800;
  if(r.levelUp){toast('LEVEL '+r.levelUp+' REACHED',4);audio.play('powerup_spawn');}
}
function rankLine(){
  const l=levelOf(prof.xp),next=Object.entries(mp.unlocks).filter(([,v])=>v>l).sort((a,b)=>a[1]-b[1])[0],label=id=>WEAPONS[id]?.name??perkName(id);
  return `LEVEL ${l}${l>=MAX_LEVEL?' (MAX)':` · ${prof.xp-xpForLevel(l)} / ${xpForLevel(l+1)-xpForLevel(l)} XP`} · ${prof.kills} kills · ${prof.wins}/${prof.matches} wins${next?` · next unlock: ${label(next[0])} at level ${next[1]}`:''}`;
}
// Game mode: team deathmatch scores on kills; recovery scores on collecting the marker a kill drops.
let mode=mp.modes[params.get('mode')]?params.get('mode'):mp.modes[saved.mode]?saved.mode:'tdm';const rules=()=>mp.modes[mode],tags=[];let tagSeq=0;
function tagMesh(team){const m=new THREE.Mesh(new THREE.OctahedronGeometry(11),new THREE.MeshBasicMaterial({color:mp.teams[team].color}));scene.add(m);return m;}
function dropTag(o){const p=feet(o).clone();p.y+=26;const t={id:tagSeq++,team:o.team,pos:p,until:time+rules().markerSeconds,mesh:tagMesh(o.team)};t.mesh.position.copy(p);tags.push(t);}
function removeTag(t){t.mesh.removeFromParent();t.mesh.geometry.dispose();t.mesh.material.dispose();tags.splice(tags.indexOf(t),1);}
function updateTags(dt,sim){
  for(const t of [...tags]){t.mesh.rotation.y+=dt*3;t.mesh.position.y=t.pos.y+Math.sin(time*4+t.id)*4;if(!sim||ended)continue;
    if(time>=t.until){removeTag(t);continue;}
    const s=soldiers.find(x=>x.alive&&Math.hypot(feet(x).x-t.pos.x,feet(x).z-t.pos.z)<42&&Math.abs(feet(x).y+26-t.pos.y)<70);if(!s)continue;
    const scored=s.team!==t.team;if(scored)score[s.team]++;removeTag(t);
    if(s.human){award([scored?'collect':'deny']);audio.play('powerup_spawn',.5);}
    killfeed.unshift({t:time,text:`<b style="color:${mp.teams[s.team].color}">${s.name}</b> <i>${scored?'collected a marker':'denied a marker'}</i>`});killfeed.length=Math.min(killfeed.length,6);
    if(!ended&&score[s.team]>=rules().scoreLimit)endMatch();}
}
const nearestTag=(p,far)=>{let best=null,bd=far;for(const t of tags){const d=t.pos.distanceTo(p);if(d<bd){bd=d;best=t;}}return best;};
const perkName=id=>mp.perks.flat().find(p=>p.id===id)?.name??id;
const eyeH=58,up=new THREE.Vector3(0,1,0);

// ---------- weapons (per soldier) ----------
class Arms {
  constructor(o,perks){this.perks=new Set(perks);this.defs=[WEAPONS[o.primary],WEAPONS[o.secondary]];this.slot=0;this.ammo=this.defs.map(d=>({mag:d.clipSize,reserve:Math.round(d.clipSize*(this.perks.has('deeppockets')?5:3))}));this.fireLeft=0;this.reloadLeft=0;this.burst=0;}
  get def(){return this.defs[this.slot];}get state(){return this.ammo[this.slot];}
  update(dt){this.fireLeft=Math.max(0,this.fireLeft-dt);if(this.reloadLeft>0){this.reloadLeft-=dt;if(this.reloadLeft<=0){const s=this.state,n=Math.min(this.def.clipSize-s.mag,s.reserve);s.mag+=n;s.reserve-=n;}}}
  canFire(){return this.fireLeft<=0&&this.reloadLeft<=0&&this.state.mag>0;}
  fire(){if(!this.canFire())return false;this.state.mag--;this.fireLeft=this.def.fireTime;return true;}
  reload(){const s=this.state;if(this.reloadLeft>0||s.mag>=this.def.clipSize||s.reserve<=0)return false;this.reloadLeft=(this.def.segmentedReload?(this.def.reloadTime*(this.def.clipSize-s.mag)+.5):this.def.reloadTime)*(this.perks.has('quickdraw')?.6:1);return true;}
  swap(){this.slot=1-this.slot;this.reloadLeft=0;this.fireLeft=.35;}
  refill(){this.ammo[this.slot].mag=this.def.clipSize;}
}
// ---------- soldiers ----------
const teamAssets=[];
async function loadTeams(){for(const t of mp.teams)teamAssets.push(await loadAsset(t.model));teamAssets.gun=await loadAsset('models/rifle.glb');}
function makeBody(team){
  const t=mp.teams[team],asset=teamAssets[team],model=instance(asset,70,'y');model.rotation.y=Math.PI/2;
  model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;if(t.showMesh&&!t.showMesh.some(n=>o.name.startsWith(n.replace('.',''))))o.visible=false;}});
  if(t.attachGun){const wrist=model.getObjectByName(t.attachGun);if(wrist){model.updateMatrixWorld(true);const ws=wrist.getWorldScale(new THREE.Vector3()),g=instance(teamAssets.gun,30,'max');g.scale.multiplyScalar(1/ws.x);g.rotation.set(0,Math.PI/2,Math.PI/2);wrist.add(g);}}
  const tint=new THREE.Color(t.color);model.traverse(o=>{if(o.isMesh&&o.visible){o.material=[o.material].flat().map(m=>{const c=m.clone();c.emissive=tint;c.emissiveIntensity=.07;return c;});if(o.material.length===1)o.material=o.material[0];}});
  const rig=new ClipRig(model,asset.clips);for(const [k,c] of Object.entries(t.clips))rig.map(k,c);rig.play('idle');
  const root=new THREE.Group();root.add(model);
  const tag=new THREE.Sprite(new THREE.SpriteMaterial({color:t.color,transparent:true,opacity:.85,depthTest:false}));tag.scale.set(6,6,1);tag.position.y=84;root.add(tag);
  scene.add(root);return {root,rig,tag};
}
function makeSoldier({name,team,human=false,o=loadout,difficulty}){
  const s={id:soldiers.length,name,team,human,o,perks:new Set(o.perks),arms:new Arms(o,o.perks),pos:new THREE.Vector3(),yaw:0,pitch:0,alive:false,respawnAt:0,health:100,maxHealth:o.perks.includes('thickskin')?125:100,
    kills:0,deaths:0,streak:0,earned:[],lastHurt:-9,diff:mp.difficulty[difficulty??o.difficulty??'regular'],path:[],pathIndex:0,repath:0,target:null,react:0,know:new Map(),lane:['north','mid','south'][Math.floor(Math.random()*3)],dir:team===0?1:-1,wp:0,strafe:1,strafeT:0,aimErr:new THREE.Vector2(),aimT:0,lastFire:-9};
  if(!human)Object.assign(s,makeBody(team));
  soldiers.push(s);return s;
}
const enemiesOf=s=>soldiers.filter(o=>o.team!==s.team&&o.alive);
const feet=s=>s.human?player.getFeetPosition():s.pos;
const eye=s=>s.human?camera.position.clone():s.pos.clone().add(new THREE.Vector3(0,eyeH,0));
function spawnPoint(team){
  const pts=world.spawns.filter(p=>p.team===team);let best=pts[0],bestD=-1;
  for(const p of pts){const v=vector(p.position);let d=Infinity;for(const e of soldiers)if(e.team!==team&&e.alive)d=Math.min(d,feet(e).distanceTo(v));d+=Math.random()*200;if(d>bestD){bestD=d;best=p;}}
  return best;
}
function respawn(s){
  const p=spawnPoint(s.team);s.alive=true;s.health=s.maxHealth;s.arms=new Arms(s.o,s.o.perks);s.target=null;s.know.clear();s.path=[];s.lastHurt=-9;
  if(s.human){player.setSpawn(vector(p.position));player.respawn();camera.rotation.set(0,p.yaw,0);view.currentId=null;view.equip(s.arms.def);}
  else{s.pos.fromArray(p.position);s.yaw=p.yaw;s.netPos=null;s.root.visible=true;s.rig.play('idle',true,1,0);s.wp=s.team===0?0:6;s.lane=['north','mid','south'][Math.floor(Math.random()*3)];
    if(s.remote?.open)s.remote.send({t:'spawn',pos:p.position,yaw:p.yaw});}
}
// ---------- shooting ----------
function hitTest(ray,far,shooter){
  let best=null;
  for(const o of soldiers){
    if(!o.alive||o===shooter||o.team===shooter.team)continue;
    const f=feet(o),head=new THREE.Sphere(f.clone().add(new THREE.Vector3(0,o.human?60:63,0)),7.5);
    const hp=ray.intersectSphere(head,new THREE.Vector3()),bp=ray.intersectBox(new THREE.Box3(f.clone().add(new THREE.Vector3(-13,2,-13)),f.clone().add(new THREE.Vector3(13,56,13))),new THREE.Vector3());
    const point=hp??bp;if(!point)continue;const d=point.distanceTo(ray.origin);if(d>far||best&&best.d<d)continue;best={o,head:!!hp&&(!bp||hp.distanceTo(ray.origin)<=bp.distanceTo(ray.origin)+10),point,d};
  }
  return best;
}
function fireShot(s,dir,from=null){
  const def=s.arms.def,origin=from??eye(s),pellets=Math.max(1,def.pellets||1);let hitAny=false;
  for(let i=0;i<pellets;i++){
    const d=dir.clone(),spread=(def.spread??.02)*(s.human&&ads?.3:1)*(s.perks.has('steady')?.6:1)*(pellets>1?1.6:1);
    d.x+=(Math.random()-.5)*spread;d.y+=(Math.random()-.5)*spread;d.z+=(Math.random()-.5)*spread;d.normalize();
    const ray=new THREE.Ray(origin,d),wall=world.raycast(ray,1,6000),h=hitTest(ray,wall?.distance??6000,s);
    const end=h?.point??wall?.position??origin.clone().addScaledVector(d,3000);
    if(h){hitAny=true;damage(h.o,(h.d>def.range?def.minDamage:def.damage)*(h.head?def.headMultiplier:1),s,def.name,h.head);}
    else if(wall)puff(wall.position,0xb8a388);
    if(i===0){tracer(origin.clone().addScaledVector(d,30).add(new THREE.Vector3(0,-4,0)),end);if(netRole==='host')evts.push(['shot',s.id,origin.toArray().map(Math.round),end.toArray().map(Math.round),def.id]);}
  }
  // gunfire gives your position away to nearby enemies
  for(const o of soldiers)if(!o.human&&o.team!==s.team&&o.alive&&feet(o).distanceTo(feet(s))<1800)o.know.set(s.id,{pos:feet(s).clone(),t:time});
  if(!s.human)audio.at(Math.max(0,1-feet(s).distanceTo(camera.position)/2200)*.8,()=>audio.shot(def));
  return hitAny;
}
function damage(o,n,by,weapon,head=false){
  if(!o.alive||ended)return;o.health-=n;o.lastHurt=time;
  if(netRole==='host'&&by?.remote)evts.push(['hit',by.id,head?1:0]);
  if(by?.human){hitUntil=time+.12;$('hitmarker').style.color=head?'#db5140':'#eee';audio.play('hit',.6);}
  if(o.human){audio.play('hurt');}
  if(!o.human&&by)o.know.set(by.id,{pos:feet(by).clone(),t:time});
  puff(feet(o).clone().add(new THREE.Vector3(0,head?62:40,0)),0x8a1a14,5);
  if(o.health<=0)kill(o,by,weapon,head);
}
function kill(o,by,weapon,head){
  o.alive=false;o.deaths++;o.streak=0;o.respawnAt=time+mp.respawnDelay;
  if(!o.human){o.rig.play('death',false,1,.1);setTimeout(()=>{if(!o.alive)o.root.visible=false;},2200);}
  else{lastKiller=by&&by!==o?by:null;prof.deaths++;deathCam=by&&by!==o?by:null;$('death').hidden=false;$('death').textContent=(by&&by!==o?'Killed by '+by.name:'You died')+' · respawning…';}
  if(by&&by!==o&&by.team!==o.team){
    by.kills++;by.streak++;if(mode==='tdm')score[by.team]++;else dropTag(o);
    if(by.human){chainN=time-lastKillT<4?chainN+1:1;lastKillT=time;const gun=!mp.streaks.some(st=>st.name===weapon);
      award(killAwards({head,distance:gun?feet(o).distanceTo(feet(by)):0,chain:chainN,payback:o===lastKiller,opening:!opened}));if(o===lastKiller)lastKiller=null;}
    opened=true;if(by.perks.has('scavenger'))by.arms.refill();
    for(const st of mp.streaks)if(by.streak===st.kills-(by.perks.has('hardline')?1:0)){by.earned.push(st.id);if(by.human){toast(st.name+' ready · press 5',4);audio.play('powerup_spawn');}}
    if(!by.human&&!by.remote)while(by.earned.length)useStreak(by,by.earned.shift());
  }else if(by===o)score[o.team===0?1:0]+=0;
  killfeed.unshift({t:time,text:`<b style="color:${mp.teams[by?.team??o.team].color}">${by?.name??'World'}</b> <i>${weapon}${head?' ✦':''}</i> <b style="color:${mp.teams[o.team].color}">${o.name}</b>`});killfeed.length=Math.min(killfeed.length,6);
  if(!ended&&(score[0]>=rules().scoreLimit||score[1]>=rules().scoreLimit))endMatch();
}
// ---------- killstreaks ----------
function useStreak(s,id){
  const st=mp.streaks.find(x=>x.id===id);killfeed.unshift({t:time,text:`<b style="color:${mp.teams[s.team].color}">${s.name}</b> called in <i>${st.name}</i>`});
  if(id==='scan')scanUntil[s.team]=time+30;
  if(id==='airstrike'){
    const bands={north:z=>z<-300,mid:z=>Math.abs(z)<=300,south:z=>z>300},foes=enemiesOf(s),lane=Object.keys(bands).sort((a,b)=>foes.filter(f=>bands[b](feet(f).z)).length-foes.filter(f=>bands[a](feet(f).z)).length)[0];
    const z={north:-650,mid:0,south:650}[lane];if(soldiers.some(x=>x.human&&x.team!==s.team))toast('Incoming airstrike: '+lane+' lane!',3);
    for(let i=0;i<9;i++)strikes.push({at:time+1.5+i*.18,pos:new THREE.Vector3(-1200+i*300,0,z+(Math.random()-.5)*200),owner:s});
  }
  if(id==='drone'){
    const mesh=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(22,10,30),new THREE.MeshStandardMaterial({color:0x303436,metalness:.6}));body.position.y=9;mesh.add(body);
    for(const x of [-12,12])for(const z of [-11,11]){const w=new THREE.Mesh(new THREE.CylinderGeometry(5,5,4,10),new THREE.MeshStandardMaterial({color:0x111111}));w.rotation.z=Math.PI/2;w.position.set(x,5,z);mesh.add(w);}
    const led=new THREE.Mesh(new THREE.SphereGeometry(2,6,4),new THREE.MeshBasicMaterial({color:mp.teams[s.team].color}));led.position.y=16;mesh.add(led);
    mesh.position.copy(feet(s));scene.add(mesh);drones.push({mesh,owner:s,life:20,path:[],repath:0});
  }
}
function explode(p,radius,dmg,owner,name){
  boomFx(p,radius);if(netRole==='host')evts.push(['boom',p.toArray().map(Math.round),radius]);
  for(const o of soldiers){if(!o.alive||(o.team===owner.team&&o!==owner))continue;const d=feet(o).distanceTo(p);if(d<radius&&world.lineClear(p.clone().add(new THREE.Vector3(0,20,0)),feet(o).clone().add(new THREE.Vector3(0,40,0))))damage(o,dmg*(1-d/radius*.7),owner,name);}
}
function boomFx(p,radius){
  for(let i=0;i<14;i++)puff(p.clone().add(new THREE.Vector3(0,10,0)),0xffa040,1,240);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(radius*.45,14,10),new THREE.MeshBasicMaterial({color:0xffb050,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));ball.position.copy(p);scene.add(ball);fx.push({mesh:ball,life:.3,grow:radius*3});
  audio.at(Math.max(.15,1-p.distanceTo(camera.position)/3000),()=>audio.play('explosion'));
}
// ---------- effects ----------
let hitUntil=0,toastUntil=0,deathCam=null;
function puff(p,color,n=3,speed=90){for(let i=0;i<n;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color}));m.position.copy(p);scene.add(m);fx.push({mesh:m,life:.35+Math.random()*.2,v:new THREE.Vector3((Math.random()-.5)*speed,Math.random()*speed,(Math.random()-.5)*speed)});}}
function tracer(a,b){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0xffe0a0,transparent:true,opacity:.5}));scene.add(l);fx.push({mesh:l,life:.06});}
function toast(t,d=2.5){$('toast').textContent=t;toastUntil=time+d;}
// ---------- bot brain ----------
function botThink(s,dt){
  const d=s.diff,me=feet(s),myEye=eye(s);
  s.repath-=dt;s.strafeT-=dt;s.aimT-=dt;
  // perception
  if(!s.lookT||time>=s.lookT){
    s.lookT=time+.15;let best=null,bestD=Infinity;
    const scanning=scanUntil[s.team]>time;
    for(const e of enemiesOf(s)){
      const ef=feet(e),dist=ef.distanceTo(me);if(dist>3000)continue;
      if(scanning&&!e.perks.has('ghostline'))s.know.set(e.id,{pos:ef.clone(),t:time});
      const to=ef.clone().add(new THREE.Vector3(0,40,0)).sub(myEye).normalize(),facing=new THREE.Vector3(-Math.sin(s.yaw),0,-Math.cos(s.yaw));
      if(dist>260&&to.dot(facing)<d.fov-1+.6)continue;
      if(!world.lineClear(myEye,ef.clone().add(new THREE.Vector3(0,45,0))))continue;
      if(dist<bestD){bestD=dist;best=e;}
    }
    if(best!==s.target){s.target=best;s.react=d.reaction*(best?.perks.has('lightstep')?1.5:1)*(.8+Math.random()*.4);}
    if(best)s.know.set(best.id,{pos:feet(best).clone(),t:time});
  }
  const arms=s.arms;arms.update(dt);
  let goal=null,moving=true;
  if(s.target&&s.target.alive){
    const tf=feet(s.target),dist=tf.distanceTo(me);
    // aim with tier-based error that wanders over time
    if(s.aimT<=0){s.aimT=.35+Math.random()*.3;s.aimErr.set((Math.random()-.5)*2*d.aimError,(Math.random()-.5)*2*d.aimError);s.aimHead=Math.random()<d.headChance;}
    const aimPoint=tf.clone().add(new THREE.Vector3(0,s.aimHead?62:40,0)),to=aimPoint.sub(myEye);
    const wantYaw=Math.atan2(-to.x,-to.z)+s.aimErr.x,wantPitch=Math.atan2(to.y,Math.hypot(to.x,to.z))+s.aimErr.y;
    let dy=((wantYaw-s.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;const turn=d.turn*dt;s.yaw+=THREE.MathUtils.clamp(dy,-turn,turn);s.pitch+=THREE.MathUtils.clamp(wantPitch-s.pitch,-turn,turn);
    s.react-=dt;
    if(s.react<=0&&Math.abs(dy)<.12){
      if(arms.state.mag===0)arms.reload();
      else if(arms.canFire()&&(arms.def.automatic||time-s.lastFire>arms.def.fireTime+.12+Math.random()*.15)){arms.fire();s.lastFire=time;
        const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(s.pitch,s.yaw,0,'YXZ'));fireShot(s,dir);s.rig.play('shoot',true,1.4);}
    }
    // keep moving while fighting: strafe, close in or back off by weapon range
    if(s.strafeT<=0){s.strafeT=.6+Math.random()*1.2;s.strafe=Math.random()<.5?-1:1;}
    const side=new THREE.Vector3(Math.cos(s.yaw),0,-Math.sin(s.yaw)).multiplyScalar(s.strafe*60);
    const ideal=arms.def.range*.6,toward=tf.clone().sub(me).setY(0).normalize().multiplyScalar(dist>ideal+200?80:dist<200?-60:0);
    goal=me.clone().add(side).add(toward);s.path=[me.clone(),goal];s.pathIndex=1;s.fighting=true;
  }else{
    s.fighting=false;if(arms.state.mag<arms.def.clipSize*.4)arms.reload();
    let known=null;for(const [id,k] of s.know){if(time-k.t>7){s.know.delete(id);continue;}if(!known||k.t>known.t)known=k;}
    const marker=tags.length?nearestTag(me,900):null;
    if(marker){if(s.repath<=0||s.pathIndex>=s.path.length){s.path=world.path(me,marker.pos.clone().setY(marker.pos.y-26));s.pathIndex=1;s.repath=.8;}}
    else if(known&&(s.repath<=0||!s.path.length)){s.path=world.path(me,known.pos);s.pathIndex=1;s.repath=1;}
    else if(!known&&(s.repath<=0||s.pathIndex>=s.path.length)){
      const lane=world.waypoints.filter(w=>w.lane===s.lane).sort((a,b)=>a.index-b.index);let wp=lane[s.wp];
      if(!wp||vector(wp.position).distanceTo(me)<80){s.wp+=s.dir;if(s.wp<0||s.wp>=lane.length){s.dir*=-1;s.wp+=2*s.dir;if(Math.random()<.4)s.lane=['north','mid','south'][Math.floor(Math.random()*3)];}wp=lane[THREE.MathUtils.clamp(s.wp,0,lane.length-1)];}
      s.path=world.path(me,vector(wp.position));s.pathIndex=1;s.repath=2;
    }
    const next=s.path[s.pathIndex];if(next){const to=next.clone().sub(me);const want=Math.atan2(-to.x,-to.z);let dy=((want-s.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;s.yaw+=THREE.MathUtils.clamp(dy,-d.turn*dt,d.turn*dt);s.pitch*=.9;}
  }
  // walk the path on the navmesh
  const speed=(s.fighting?120:190)*(s.perks.has('fleetfoot')?1.12:1),next=s.path[s.pathIndex];
  if(next){const delta=next.clone().sub(me),h=Math.hypot(delta.x,delta.z);
    if(h<12)s.pathIndex++;else{const step=me.clone().addScaledVector(delta,Math.min(1,speed*dt/h));
      for(const o of soldiers){if(o===s||!o.alive)continue;const sep=step.clone().sub(feet(o));sep.y=0;const dd=sep.length();if(dd<30&&dd>.01)step.addScaledVector(sep,(30-dd)/dd*.5);}
      const safe=world.closest(step,{x:24,y:40,z:24});if(safe&&safe.distanceTo(step)<30)me.copy(safe);else moving=false;}}
  else moving=false;
  if(!s.fighting||!arms.canFire())s.rig.play(moving?'run':'idle',true,moving?speed/190:1);
  s.root.position.copy(me);s.root.rotation.y=s.yaw+Math.PI/2;
  s.tag.visible=s.team===humanTeam()||scanUntil[humanTeam()]>time&&!s.perks.has('ghostline');
  if(time-s.lastHurt>5)s.health=Math.min(s.maxHealth,s.health+dt*40);
}
const humanTeam=()=>soldiers.find(s=>s.human)?.team??0;
// ---------- online play ----------
// A remote player's soldier: position comes from the network, the body just follows it.
function puppet(s,dt){
  if(s.netPos)s.pos.lerp(s.netPos,Math.min(1,dt*14));
  s.prev??=s.pos.clone();const moved=s.pos.distanceTo(s.prev)>dt*40;s.prev.copy(s.pos);
  s.rig.play(time-s.lastFire<.25?'shoot':moved?'run':'idle',true,1);s.root.position.copy(s.pos);s.root.rotation.y=s.yaw+Math.PI/2;
  s.tag.visible=s.team===humanTeam()||scanUntil[humanTeam()]>time&&!s.perks.has('ghostline');
  if(netRole==='host'&&time-s.lastHurt>5)s.health=Math.min(s.maxHealth,s.health+dt*40);
}
function snapshot(you){return {t:'snap',you,time,score,mode,tags:tags.map(t=>[t.id,t.team,...t.pos.toArray().map(Math.round)]),scan:scanUntil,ended,ev:evts,feed:killfeed.map(k=>[k.t,k.text]),
  sol:soldiers.map(s=>({id:s.id,name:s.human?(loadout.name||'Host'):s.name,team:s.team,a:s.alive,h:Math.round(s.health),k:s.kills,d:s.deaths,s:s.streak,e:s.earned,p:feet(s).toArray().map(v=>Math.round(v*10)/10),y:s.human?camera.rotation.y:s.yaw,w:s.arms.def.id,f:time-s.lastFire<.2?1:0}))};}
function hostData(conn,m){
  const s=net.conns.get(conn);
  if(m.t==='hello'){
    const o={primary:mp.primaries.includes(m.o?.primary)?m.o.primary:'halvard',secondary:mp.secondaries.includes(m.o?.secondary)?m.o.secondary:'warden',perks:(m.o?.perks??[]).filter(id=>mp.perks.flat().some(p=>p.id===id)).slice(0,3)},name=clean(m.name);
    if(started){seat(conn,name,o);return;}
    if(lobby.some(p=>p.conn===conn))return;
    if(lobby.length>=loadout.size*2-1){conn.send({t:'full'});return;}
    const n=t=>lobby.filter(p=>p.team===t).length+(hostTeam===t?1:0);lobby.push({conn,name,o,team:n(1)<n(0)?1:0,ready:false});sendLobby();return;
  }
  const member=lobby.find(p=>p.conn===conn);
  if(member){if(m.t==='ready')member.ready=!!m.v;if(m.t==='team')member.team=m.v?1:0;if(m.t==='bye'){lobby.splice(lobby.indexOf(member),1);}sendLobby();return;}
  if(!s)return;
  s.lastNet=performance.now();
  if(m.t==='bye'){dropPeer(conn);return;}
  if(m.t==='pos'&&s.alive){s.netPos=(s.netPos??new THREE.Vector3()).fromArray(m.p);s.yaw=+m.y||0;s.pitch=+m.x||0;}
  if(m.t==='fire'&&s.alive){const w=s.arms.defs.findIndex(d=>d.id===m.w);if(w<0)return;s.arms.slot=w;s.lastFire=time;
    const o=vector(m.o),mine=eye(s);fireShot(s,vector(m.d).normalize(),o.distanceTo(mine)<160?o:mine);}
  if(m.t==='streak'&&s.alive&&s.earned.length)useStreak(s,s.earned.shift());
}
// Put a joining player in a bot's slot, on the team they asked for when it has room.
function seat(conn,name,o,want){
  const count=t=>soldiers.filter(x=>x.team===t&&(x.human||x.remote)).length,team=want??(count(1)<count(0)?1:0),bot=soldiers.find(x=>x.team===team&&!x.human&&!x.remote)??soldiers.find(x=>!x.human&&!x.remote);
  if(!bot){conn.send({t:'full'});return;}
  Object.assign(bot,{remote:conn,name,o,perks:new Set(o.perks),maxHealth:o.perks.includes('thickskin')?125:100,streak:0,earned:[],target:null});
  bot.lastNet=performance.now();net.conns.set(conn,bot);conn.send(snapshot(bot.id));respawn(bot);toast(bot.name+' joined team '+mp.teams[bot.team].name,3);
}
// ---------- pre-game lobby (online rooms) ----------
function lobbyState(){return {t:'lobby',room,mode,count:countdown,size:loadout.size,diff:loadout.difficulty,players:[{name:clean(loadout.name||'Host'),team:hostTeam,ready:true,host:true},...lobby.map(p=>({name:p.name,team:p.team,ready:p.ready}))]};}
function sendLobby(){if(netRole!=='host'||started)return;const st=lobbyState();lobby.forEach((p,i)=>{if(p.conn.open)p.conn.send({...st,you:i+1});});drawLobby({...st,you:0});}
function drawLobby(st){
  const me=st.players?.[st.you];if(!me)return;lastLobby=st;myReady=!!me.ready;myTeam=me.team?1:0;const el=$('lobby'),size=+st.size||0;el.hidden=false;
  el.innerHTML=`<h4>ROOM ${clean(st.room)} · ${size} v ${size} · ${mp.modes[st.mode]?.name??''} · ${clean(st.diff)} bots fill empty slots${st.count?` · <b>STARTING IN ${+st.count}</b>`:''}</h4><div class="lobby-teams">`+[0,1].map(t=>`<div style="--c:${mp.teams[t].color}"><h5>${mp.teams[t].name}</h5>`+st.players.map((p,i)=>(p.team?1:0)!==t?'':`<p class="${i===st.you?'you':''}"><span>${clean(p.name)}${p.host?' ★':''}</span><span>${p.ready?'READY':'not ready'}</span>${st.you===0&&i>0?`<button data-kick="${i-1}" type="button" title="Remove from room">✕</button>`:'<i></i>'}</p>`).join('')+'</div>').join('')+'</div><button data-act="team" type="button">SWITCH TEAM</button>';
  const ready=st.players.filter(p=>p.ready).length;
  $('start').innerHTML=(netRole==='client'?(myReady?'NOT READY':'READY UP'):st.count?`STARTING IN ${+st.count}`:st.players.length>1?`START MATCH (${ready}/${st.players.length} READY)`:'START MATCH')+' <span>→</span>';
}
function lobbyClick(e){
  const b=e.target.closest('button');if(!b||started||countdown)return;
  if(b.dataset.act==='team'){if(netRole==='host'){hostTeam=1-hostTeam;sendLobby();}else net.send({t:'team',v:1-myTeam});}
  if(b.dataset.kick!==undefined&&netRole==='host'){const p=lobby[+b.dataset.kick];if(!p)return;lobby.splice(lobby.indexOf(p),1);try{p.conn.send({t:'kicked'});}catch{}setTimeout(()=>{try{p.conn.close();}catch{}},300);sendLobby();}
}
function beginCountdown(){
  countdown=3;sendLobby();
  const tick=setInterval(()=>{if(started){clearInterval(tick);countdown=0;return;}countdown--;if(countdown>0){sendLobby();return;}clearInterval(tick);startMatch();closeLobby();},1000);
}
function closeLobby(){if($('lobby').hidden)return;$('lobby').hidden=true;$('start').innerHTML='DEPLOY <span>→</span>';$('menu-status').textContent='Match is live · click DEPLOY';}
function dropPeer(conn){hostClose(conn);net.conns.delete(conn);try{conn.close();}catch{}}
function hostClose(conn){const i=lobby.findIndex(p=>p.conn===conn);if(i>=0){lobby.splice(i,1);sendLobby();}const s=net.conns.get(conn);if(s){s.remote=null;s.netPos=null;toast(s.name+' left',3);s.name+=' (bot)';}}
// Feed lines arrive from the host as markup: keep only the name colour and italic tags, escape the rest.
const feedText=t=>String(t).slice(0,300).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';').replace(/&#60;b style=&#34;color:(#[0-9a-fA-F]{3,8})&#34;&#62;/g,'<b style="color:$1">').replace(/&#60;(\/?)(b|i)&#62;/g,'<$1$2>');
function clientData(conn,m){
  if(m.t==='full'){$('menu-status').textContent='That room is full';return;}
  if(m.t==='spawn'){const h=human();if(!h)return;h.alive=true;h.health=h.maxHealth;h.arms=new Arms(h.o,h.o.perks);player.setSpawn(vector(m.pos));player.respawn();camera.rotation.set(0,m.yaw,0);view.currentId=null;view.equip(h.arms.def);$('death').hidden=true;return;}
  if(m.t==='lobby'){if(!started)drawLobby(m);return;}
  if(m.t==='kicked'){$('lobby').hidden=true;$('start').disabled=true;$('menu-status').textContent='The host removed you from the room';return;}
  if(m.t!=='snap')return;
  closeLobby();myId=m.you;if(mp.modes[m.mode]&&m.mode!==mode){mode=m.mode;matchInfo();}
  if(Array.isArray(m.tags)){const live=new Set(m.tags.map(a=>a[0]));for(const t of [...tags])if(!live.has(t.id))removeTag(t);
    for(const a of m.tags.slice(0,40))if(!tags.some(t=>t.id===a[0])){const team=a[1]?1:0,t={id:a[0],team,pos:new THREE.Vector3(+a[2]||0,+a[3]||0,+a[4]||0),until:Infinity,mesh:tagMesh(team)};t.mesh.position.copy(t.pos);tags.push(t);}}time=m.time;score[0]=m.score[0];score[1]=m.score[1];scanUntil[0]=m.scan[0];scanUntil[1]=m.scan[1];
  for(const d of m.sol){
    let s=soldiers[d.id];
    if(!s){s=makeSoldier({name:clean(d.name),team:d.team?1:0,human:d.id===myId,o:d.id===myId?loadout:{primary:mp.primaries.includes(d.w)?d.w:'halvard',secondary:'warden',perks:[]}});started=true;}
    const was=s.alive;if(s.human){for(let i=s.kills;i<Math.min(d.k,s.kills+5);i++)award(['kill']);if(was&&!d.a)prof.deaths++;}s.kills=d.k;s.deaths=d.d;s.streak=d.s;
    if(s.human){if(d.h<s.health-.5&&d.a)audio.play('hurt');s.health=d.h;s.earned=d.e;if(was&&!d.a){s.alive=false;$('death').hidden=false;$('death').textContent='You died · respawning…';}}
    else{s.name=clean(d.name);s.netPos=(s.netPos??new THREE.Vector3()).fromArray(d.p);s.yaw=d.y;s.health=d.h;if(d.f)s.lastFire=time;
      if(!was&&d.a){s.pos.copy(s.netPos);s.root.visible=true;s.rig.play('idle',true,1,0);}
      if(was&&!d.a){s.rig.play('death',false,1,.1);setTimeout(()=>{if(!s.alive)s.root.visible=false;},2200);}s.alive=d.a;}
  }
  killfeed.length=0;for(const [t,text] of m.feed.slice(0,6))killfeed.push({t:+t,text:feedText(text)});
  for(const e of m.ev){
    if(e[0]==='shot'&&e[1]!==myId){const a=vector(e[2]),b=vector(e[3]);tracer(a,b);audio.at(Math.max(0,1-a.distanceTo(camera.position)/2200)*.8,()=>audio.shot(WEAPONS[e[4]]??WEAPONS.halvard));}
    if(e[0]==='hit'&&e[1]===myId){hitUntil=time+.12;$('hitmarker').style.color=e[2]?'#db5140':'#eee';audio.play('hit',.6);}
    if(e[0]==='boom')boomFx(vector(e[1]),e[2]);
  }
  if(m.ended&&!ended)endMatch();
}
async function goOnline(){
  if(netRole==='solo')return;
  net.onStatus=text=>{$('net-status').textContent=netRole==='host'?`Room ${room} · ${text}`:text;};
  try{
    if(netRole==='host'){net.onData=hostData;net.onClose=hostClose;await net.host(room);const link=location.origin+location.pathname+'?join='+room;$('net-status').innerHTML=`Room <b>${room}</b> · share <a href="${link}" style="color:#e0b060">${link}</a>`;sendLobby();}
    else{net.onData=clientData;$('net-status').textContent='Joining room '+room+'…';for(let n=0;;n++){try{await net.join(room);break;}catch(e){if(n>=4)throw e;$('net-status').textContent='Waiting for room '+room+'…';await new Promise(r=>setTimeout(r,3000));}}net.send({t:'hello',name:loadout.name||'Guest',o:loadout});$('net-status').textContent='Connected to room '+room;}
  }catch(e){$('net-status').textContent='Could not connect: '+(e.type??e.message);if(netRole==='host')netRole='solo';}
}
// ---------- match flow ----------
function endMatch(){
  ended=true;const w=score[0]===score[1]?null:score[0]>score[1]?0:1;
  $('end').hidden=false;$('end-title').textContent=w===null?'DRAW':`TEAM ${mp.teams[w].name.toUpperCase()} WINS`;
  $('end-score').textContent=`${score[0]} — ${score[1]}`;
  if(human()){const list=['finish'];if(w===humanTeam()){list.push('win');prof.wins++;}prof.matches++;award(list);const l=levelOf(prof.xp);
    $('end-xp').textContent=`+${matchAwards.xp} XP · level ${matchAwards.startLevel}${l>matchAwards.startLevel?' → '+l:''}`+Object.entries(matchAwards.medals).map(([id,n])=>` · ${MEDALS[id]} ×${n}`).join('');}board(true);setActive(false);document.exitPointerLock?.();
}
function board(force){
  const show=force||keys.has('Tab')||pad.state?.pressedBack;$('scoreboard').hidden=!show;if(!show)return;
  $('scoreboard-body').innerHTML=[0,1].map(t=>`<div class="team" style="--c:${mp.teams[t].color}"><h3>${mp.teams[t].name} <span>${score[t]}</span></h3>`+soldiers.filter(s=>s.team===t).sort((a,b)=>b.kills-a.kills).map(s=>`<p class="${s.human?'you':''}"><span>${s.name}</span><span>${s.kills}</span><span>${s.deaths}</span></p>`).join('')+'</div>').join('');
}
function minimap(){
  const c=$('minimap'),g=c.getContext('2d'),W=c.width,H=c.height,sx=x=>(x+1500)/3000*W,sz=z=>(z+900)/1800*H;
  g.fillStyle='rgba(10,14,20,.7)';g.fillRect(0,0,W,H);g.fillStyle='rgba(200,200,180,.18)';
  for(const s of map.kit.solids)if(s.max[1]>60&&s.max[1]<200&&!s.invisible)g.fillRect(sx(s.min[0]),sz(s.min[2]),Math.max(1,sx(s.max[0])-sx(s.min[0])),Math.max(1,sz(s.max[2])-sz(s.min[2])));
  const me=soldiers.find(s=>s.human),team=humanTeam(),scanning=scanUntil[team]>time;
  for(const s of soldiers){if(!s.alive)continue;const f=feet(s),friend=s.team===team,recent=time-s.lastFire<.6;
    if(!friend&&!(scanning&&!s.perks.has('ghostline'))&&!recent)continue;g.fillStyle=s.human?'#fff':friend?mp.teams[team].color:'#ff4040';g.beginPath();g.arc(sx(f.x),sz(f.z),s.human?4:3,0,7);g.fill();}
  if(me?.alive){const f=feet(me),yaw=camera.rotation.y;g.strokeStyle='#fff';g.beginPath();g.moveTo(sx(f.x),sz(f.z));g.lineTo(sx(f.x)-Math.sin(yaw)*12,sz(f.z)-Math.cos(yaw)*12);g.stroke();}
  if(scanning){g.strokeStyle='rgba(120,255,160,.6)';g.strokeRect(1,1,W-2,H-2);}
}
// ---------- input ----------
const touch=createZombieTouch({onLook:(x,y,s)=>{if(!active)return;camera.rotation.y-=x*.005*s;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-y*.005*s,-1.5,1.5);},
  onAction:a=>{if(!active)return;if(a==='reload')reloadHuman();if(a==='weapon')swapHuman();if(a==='claymore'||a==='equipment')streakHuman();},onPause:()=>setActive(false)});
function setActive(v){active=!!v&&ready&&!ended;$('menu').hidden=active||ended;document.body.classList.toggle('menu-open',!active);keys.clear();primary=ads=mousePrimary=mouseAim=false;touch.reset();touch.setEnabled(active,active);if(active)audio.start();else audio.pause();}
function deploy(){if(!ready)return;readMenu();if(netRole==='client'&&!started){if(net.conn?.open)net.send({t:'ready',v:!myReady});else $('menu-status').textContent='Waiting for the host…';return;}
  if(netRole==='host'&&!started){if(countdown)return;if(lobby.length){beginCountdown();return;}startMatch();closeLobby();}
  if(!started)startMatch();audio.start();if(touch.mode||pad.connected||botsOnly){setActive(true);return;}renderer.domElement.requestPointerLock?.()?.catch?.(()=>{});}
document.addEventListener('pointerlockchange',()=>{if(touch.mode||pad.connected||botsOnly)return;setActive(document.pointerLockElement===renderer.domElement);});
addEventListener('mousemove',e=>{if(!active||document.pointerLockElement!==renderer.domElement)return;const k=ads?.0012:.002;camera.rotation.y-=e.movementX*k;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*k,-1.5,1.5);});
addEventListener('mousedown',e=>{if(!active)return;if(e.button===0){mousePrimary=true;primaryPressed=true;}if(e.button===2)mouseAim=true;});
addEventListener('mouseup',e=>{if(e.button===0)mousePrimary=false;if(e.button===2)mouseAim=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{if(['Tab','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat||!active)return;if(e.code==='KeyR')reloadHuman();if(e.code==='KeyQ'||e.code==='Digit1'||e.code==='Digit2')swapHuman();if(e.code==='Digit5')streakHuman();if(e.code==='Escape')setActive(false);});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('resize',()=>{camera.aspect=viewCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();viewCamera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const human=()=>soldiers.find(s=>s.human);
function reloadHuman(){const h=human();if(h?.alive&&h.arms.reload()){view.reload(h.arms.state.mag===0,h.arms.reloadLeft);audio.reload('magazine',h.arms.reloadLeft);}}
function swapHuman(){const h=human();if(!h?.alive)return;h.arms.swap();view.equip(h.arms.def);}
function streakHuman(){const h=human();if(!h?.alive||!h.earned.length)return;if(netRole==='client')net.send({t:'streak'});else useStreak(h,h.earned.shift());}
// ---------- menu ----------
function buildMenu(){
  const opt=(list,sel,label)=>list.map(id=>`<option value="${id}" ${id===sel?'selected':''}>${label(id)}</option>`).join('');
  const lvl=levelOf(prof.xp),gated=(list,sel,label)=>list.map(id=>{const open=isUnlocked(mp.unlocks,id,lvl);return `<option value="${id}" ${id===sel?'selected':''} ${open?'':'disabled'}>${label(id)}${open?'':' · unlocks at level '+unlockLevel(mp.unlocks,id)}</option>`;}).join('');
  $('cls-primary').innerHTML=gated(mp.primaries,loadout.primary,id=>WEAPONS[id].name);$('cls-secondary').innerHTML=gated(mp.secondaries,loadout.secondary,id=>WEAPONS[id].name);
  mp.perks.forEach((slot,i)=>{$('cls-perk'+i).innerHTML=gated(slot.map(p=>p.id),loadout.perks[i],id=>{const p=slot.find(x=>x.id===id);return p.name+' — '+p.blurb;});});
  $('rank').textContent=rankLine();$('rank-bar').style.width=(100*levelProgress(prof.xp))+'%';
  $('cls-diff').innerHTML=opt(Object.keys(mp.difficulty),loadout.difficulty,id=>id[0].toUpperCase()+id.slice(1));
  $('cls-size').innerHTML=opt(['2','3','4','5','6'],String(loadout.size),n=>n+' v '+n);$('cls-mode').innerHTML=opt(Object.keys(mp.modes),mode,id=>mp.modes[id].name+' — '+mp.modes[id].blurb);matchInfo();
  $('cls-name').value=saved.name??'';$('host-room').addEventListener('click',()=>{readMenu();location.search='?host='+Math.random().toString(36).slice(2,7).toUpperCase();});
  $('join-room').addEventListener('click',()=>{readMenu();const c=$('join-code').value.trim().toUpperCase();if(c)location.search='?join='+c;});
  $('streak-list').textContent=mp.streaks.map(s=>`${s.kills} kills: ${s.name}`).join(' · ');
}
function readMenu(){
  loadout.name=$('cls-name').value.trim().slice(0,14);if(started){try{localStorage.setItem('graveshift.class',JSON.stringify(loadout));}catch{}return;}loadout.primary=$('cls-primary').value;loadout.secondary=$('cls-secondary').value;loadout.perks=[0,1,2].map(i=>$('cls-perk'+i).value);loadout.difficulty=$('cls-diff').value;loadout.size=+$('cls-size').value;if(netRole!=='client'&&mp.modes[$('cls-mode').value])mode=$('cls-mode').value;loadout.mode=mode;matchInfo();
  try{localStorage.setItem('graveshift.class',JSON.stringify(loadout));}catch{}
}
let started=false;
function matchInfo(){$('match-info').textContent=`${rules().name} · first to ${rules().scoreLimit} · Maple Court`;}
function startMatch(){
  if(started)return;started=true;const names=[...mp.botNames].sort(()=>Math.random()-.5),size=loadout.size;
  if(!botsOnly)makeSoldier({name:'You',team:hostTeam,human:true});
  for(let t=0;t<2;t++)for(let i=soldiers.filter(s=>s.team===t).length;i<size;i++){const perks=mp.perks.map(slot=>slot[Math.floor(Math.random()*slot.length)].id);
    makeSoldier({name:names.pop(),team:t,o:{primary:mp.primaries[Math.floor(Math.random()*mp.primaries.length)],secondary:'warden',perks,difficulty:loadout.difficulty}});}
  for(const s of soldiers)respawn(s);
  for(const p of lobby.splice(0))if(p.conn.open)seat(p.conn,p.name,p.o,p.team);
  matchInfo();
}
// ---------- frame ----------
function update(dt){
  if(!ready||!started)return;
  const gp=pad.read(),t=touch.input.read();if(gp.pressed.start){active?setActive(false):deploy();}
  const sim=netRole!=='client';
  if(active||botsOnly||netRole!=='solo'){
    if(sim)time+=dt;
    const h=human();
    if(h){
      primary=mousePrimary||gp.fire||t.fire;primaryPressed ||= gp.pressed.fire||t.firePressed;ads=mouseAim||gp.aim||t.aim;
      if(gp.lookX||gp.lookY){const k=(ads?1.6:3.2)*dt;camera.rotation.y-=gp.lookX*k;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-gp.lookY*k,-1.5,1.5);}
      if(gp.pressed.reload)reloadHuman();if(gp.pressed.swap)swapHuman();if(gp.pressed.mine||gp.pressed.tactical)streakHuman();
      if(h.alive){
        const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+gp.forward+t.forward,st=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+gp.strafe+t.strafe;
        const sprint=(keys.has('ShiftLeft')&&keys.has('KeyW')||gp.sprint&&f>.3||t.sprint)&&!ads;
        player.moveSpeed=190*(h.perks.has('fleetfoot')?1.12:1);player.sprintSpeed=285*(h.perks.has('fleetfoot')?1.12:1);
        player.update(dt,{forward:THREE.MathUtils.clamp(f,-1,1),strafe:THREE.MathUtils.clamp(st,-1,1),sprint,crouch:keys.has('KeyC')||gp.crouch||t.crouch,jump:keys.has('Space')||gp.jump,jumpPressed:t.jump});
        h.arms.update(dt);if(h.arms.reloadLeft>0&&view.mode!=='reload'&&view.mode!=='raise')view.reload(false,h.arms.reloadLeft);
        if(!sprint&&(primaryPressed||(primary&&h.arms.def.automatic)||h.arms.burst>0)){
          if(h.arms.state.mag===0&&primaryPressed){audio.dry();reloadHuman();}
          else if(h.arms.fire()){view.shoot({ads});audio.shot(h.arms.def);h.lastFire=time;{const dir=camera.getWorldDirection(new THREE.Vector3());if(sim)fireShot(h,dir);else{const o=camera.position.clone(),w=world.raycast(new THREE.Ray(o,dir),1,6000);tracer(o.clone().addScaledVector(dir,30).add(new THREE.Vector3(0,-4,0)),w?.position??o.clone().addScaledVector(dir,3000));net.send({t:'fire',o:o.toArray(),d:dir.toArray(),w:h.arms.def.id});}}camera.rotation.x=Math.min(1.48,camera.rotation.x+(ads?.007:.013));
            if(h.arms.burst>0)h.arms.burst--;else if(h.arms.def.fireType==='3-Round Burst')h.arms.burst=2;}
        }
        primaryPressed=false;view.update(dt,{moving:Math.hypot(f,st)>.1,sprint,ads,reloading:h.arms.reloadLeft>0,time});view.pivot.visible=true;
        if(sim&&time-h.lastHurt>5)h.health=Math.min(h.maxHealth,h.health+dt*40);
      }else{view.pivot.visible=false;if(deathCam?.alive){const p=feet(deathCam).clone().add(new THREE.Vector3(0,90,0));camera.position.lerp(p.add(new THREE.Vector3(0,40,120)),.05);camera.lookAt(feet(deathCam).clone().add(new THREE.Vector3(0,50,0)));}}
    }else{
      // spectator: slow orbit over the arena, or follow the leading bot
      const lead=[...soldiers].filter(s=>s.alive).sort((a,b)=>b.kills-a.kills)[0];
      if(lead){const f=feet(lead),back=new THREE.Vector3(Math.sin(lead.yaw),0,Math.cos(lead.yaw)).multiplyScalar(160);camera.position.lerp(f.clone().add(back).add(new THREE.Vector3(0,110,0)),.08);camera.lookAt(f.clone().add(new THREE.Vector3(0,50,0)));}
    }
    if(!sim&&h&&performance.now()-sendT>50){sendT=performance.now();net.send({t:'pos',p:player.getFeetPosition().toArray(),y:camera.rotation.y,x:camera.rotation.x});}
    for(const s of soldiers){
      if(!s.alive){if(sim&&!ended&&time>=s.respawnAt){respawn(s);if(s.human)$('death').hidden=true;}if(!s.human)s.rig.update(dt);continue;}
      if(!s.human){if(s.remote||!sim)puppet(s,dt);else botThink(s,dt);s.rig.update(dt);}
    }
    updateTags(dt,sim);
    for(const k of [...strikes])if(time>=k.at){strikes.splice(strikes.indexOf(k),1);explode(k.pos,260,170,k.owner,'Airstrike');}
    for(const d of [...drones]){d.life-=dt;d.repath-=dt;const p=d.mesh.position;
      const foe=enemiesOf(d.owner).sort((a,b)=>feet(a).distanceTo(p)-feet(b).distanceTo(p))[0];
      if(foe&&d.repath<=0){d.path=world.path(p,feet(foe));d.repath=.5;}
      const n=d.path[1];if(n){const v=n.clone().sub(p);if(v.length()<10)d.path.shift();else{p.addScaledVector(v.normalize(),Math.min(320*dt,v.length()));d.mesh.rotation.y=Math.atan2(v.x,v.z);}}
      if(d.life<=0||foe&&feet(foe).distanceTo(p)<70){explode(p.clone(),230,220,d.owner,'RC Drone');d.mesh.removeFromParent();drones.splice(drones.indexOf(d),1);}}
    if(sim&&!ended&&time>=mp.timeLimit)endMatch();
    if(netRole==='host'&&performance.now()-snapT>66){snapT=performance.now();for(const [conn,s] of [...net.conns]){if(!s)continue;if(snapT-s.lastNet>6000){dropPeer(conn);continue;}if(conn.open)conn.send(snapshot(s.id));}evts.length=0;}
  }
  for(const f of [...fx]){f.life-=dt;if(f.v){f.v.y-=300*dt;f.mesh.position.addScaledVector(f.v,dt);}if(f.grow){f.mesh.scale.addScalar(dt*f.grow/100);f.mesh.material.opacity=Math.max(0,f.life*2);}
    if(f.life<=0){f.mesh.removeFromParent();f.mesh.geometry.dispose();f.mesh.material.dispose();fx.splice(fx.indexOf(f),1);}}
  camera.fov=THREE.MathUtils.damp(camera.fov,ads&&human()?.alive?(human().arms.def.adsFov??56):78,12,dt);camera.updateProjectionMatrix();
  hud();
}
function hud(){
  const h=human(),m=Math.max(0,mp.timeLimit-time);
  $('score-a').textContent=score[0];$('score-b').textContent=score[1];$('clock').textContent=Math.floor(m/60)+':'+String(Math.floor(m%60)).padStart(2,'0');
  $('killfeed').innerHTML=killfeed.filter(k=>time-k.t<6).map(k=>`<div>${k.text}</div>`).join('');
  if(toastUntil<time)$('toast').textContent='';$('xp-pop').style.opacity=popUntil>performance.now()?1:0;$('hitmarker').style.opacity=hitUntil>time?1:0;
  if(h){$('weapon-name').textContent=h.arms.def.name;$('mag').textContent=h.arms.state.mag;$('reserve').textContent=h.arms.state.reserve;$('reload-label').textContent=h.arms.reloadLeft>0?'RELOADING':h.arms.state.mag===0?'RELOAD':'';
    $('health-fill').style.width=(100*Math.max(0,h.health)/h.maxHealth)+'%';$('hurt').style.opacity=h.alive&&h.health<h.maxHealth?(1-h.health/h.maxHealth)*.8:0;
    $('streaks').innerHTML=`<span>STREAK ${h.streak}</span>`+mp.streaks.map(s=>`<span class="${h.earned.includes(s.id)?'ready':''}">${s.kills-(h.perks.has('hardline')?1:0)} · ${s.name}</span>`).join('')+(h.earned.length?'<b>5 / D-PAD ▼ to call in</b>':'');
    $('kd').textContent=`${h.kills} kills · ${h.deaths} deaths`;}
  board(ended);if(frames++%3===0)minimap();
}
const debug={getState:()=>({ready,started,ended,time,mode,tags:tags.length,score:[...score],active,soldiers:soldiers.map(s=>({name:s.name,team:s.team,human:s.human,alive:s.alive,kills:s.kills,deaths:s.deaths,health:s.health,pos:feet(s).toArray(),weapon:s.arms.def.id,target:s.target?.name??null})),fps,errors:[...errors]}),
  step:seconds=>{for(let t=0;t<seconds;t+=1/30)update(Math.min(1/30,seconds-t));},start:()=>{if(!started)startMatch();active=true;},setActive,assetLog,scan:team=>{scanUntil[team]=time+30;},camera,soldiers,THREE,lobby:()=>lastLobby,progress:()=>({...prof,level:levelOf(prof.xp),match:matchAwards}),net:()=>({role:netRole,status:net.status,peers:net.conns.size,myId}),fire:()=>{mousePrimary=true;primaryPressed=true;setTimeout(()=>{mousePrimary=false;},60);}};
globalThis.game={debug};
addEventListener('pagehide',()=>{if(netRole==='client')net.send({t:'bye'});});
try{
  $('load-label').textContent='Building Maple Court';world=new World(scene,base,map);await world.load((t,p)=>{$('load-label').textContent=t;$('load-progress').style.width=p+'%';},{mapName:'suburb'});world.setDoors({openDoors:new Set()});
  player=new PlayerController(camera,world.physics,{spawn:vector(world.spawns[0].position),spawnIsEye:false,radius:14,height:70,eyeHeight:60,moveSpeed:190,sprintSpeed:285,crouchSpeed:95,gravity:800,jumpHeight:39,fallResetY:-800,maxSubSteps:12,groundSnapSpeed:10});
  view=new ViewModel(viewScene,base,audio);await Promise.all([loadTeams(),view.load(),audio.load()]);
  buildMenu();ready=true;$('loading').hidden=true;$('start').disabled=false;$('menu-status').textContent=botsOnly?'Spectating a bots-only match':pad.connected?'Press START to deploy':'Click DEPLOY · Tab shows the scoreboard';
  if(botsOnly){startMatch();setActive(true);}
  loadout.name=saved.name??'';await goOnline();
}catch(e){console.error(e);errors.push(String(e));$('load-label').textContent='Unable to start: '+e.message;}
$('start').addEventListener('click',deploy);renderer.domElement.addEventListener('click',()=>{if(!active&&started&&!ended)deploy();});$('again').addEventListener('click',()=>location.reload());
$('lobby').addEventListener('click',lobbyClick);for(const id of ['cls-size','cls-diff','cls-name','cls-mode'])$(id).addEventListener('change',()=>{if(netRole==='host'&&!started){readMenu();sendLobby();}});
renderer.info.autoReset=false;
function renderFrame(now){
  if(document.hidden)return;const dt=Math.min((now-previous)/1000,.06);previous=now;frameTime+=dt;if(frameTime>.75){fps=Math.round((renderer.info.render.frame||0));frameTime=0;}
  pad.poll();update(dt);renderer.info.reset();renderer.clear();renderer.render(scene,camera);if(started&&human()?.alive){renderer.clearDepth();renderer.render(viewScene,viewCamera);}
}
renderer.setAnimationLoop(renderFrame);
