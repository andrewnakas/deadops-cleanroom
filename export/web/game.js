import * as THREE from 'three';
import { PlayerController } from './player-controller.js';
import { World, vector, zoneNames } from './world.js';
import { ViewModel } from './viewmodel.js';
import { Enemies } from './enemies.js';
import { SurvivalSession as Session } from './session.js';
import { GameAudio } from './sfx.js';
import { Powerups } from './powerups.js';
import { LuckyCrate } from './crate.js';
import { createZombieTouch } from './zombies-touch.js';
import { configureAssets, assetDiagnostics, assetLog } from './runtime-assets.js';
import { buildCinema } from './maps/cinema.js';
import { drummerToy } from './props.js';
import { loadAsset, instance } from './models.js';
import { Gamepad } from './gamepad.js';
import { settings, onSettings, bindLabel } from './settings.js';
import { Keys } from './input.js';
import { Fx } from './fx.js';
import { Recoil, spreadOf, falloff, moveScale } from './gunplay.js';
import { Crosshair, HitMarker, DamageArcs, Popups, Banners } from './hud.js';
import { mountSettings } from './ui.js';
import { Pipeline, enableShadows } from './post.js';
import { assistTarget, pullToward } from './aim.js';
import { createCoop } from './coop.js';
import { Backend } from './backend.js';

const $=id=>document.getElementById(id),keys=new Keys(),audio=new GameAudio(),pad=new Gamepad();
const profile=configureAssets();
const renderer=new THREE.WebGLRenderer({antialias:!profile.mobile,powerPreference:profile.mobile?'default':'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,profile.mobile?1:1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
let previous=performance.now(),lastRendered=0,renderedFrames=0,contextLost=false,resizeTimer;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.autoClear=false;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x07080b);scene.fog=new THREE.FogExp2(0x0b0c10,.00045);
const ambient=new THREE.AmbientLight(0x8a90a0,.7);scene.add(ambient,new THREE.HemisphereLight(0xb0b8c8,0x3a2a22,.9));
const camera=new THREE.PerspectiveCamera(settings.fov,innerWidth/innerHeight,1,8000);camera.rotation.order='YXZ';
const viewScene=new THREE.Scene(),viewCamera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,20);
viewScene.add(new THREE.AmbientLight(0xd8d0c0,1.6));const vl=new THREE.DirectionalLight(0xffefc8,2.2);vl.position.set(.5,2,1);viewScene.add(vl);
const flashlight=new THREE.SpotLight(0xfff0d8,0,1600,.6,.85,1);camera.add(flashlight);flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-100);camera.add(flashlight.target);scene.add(camera);
const muzzle=new THREE.PointLight(0xffc276,0,300,1.4);scene.add(muzzle);
const pipeline=new Pipeline({renderer,scene,camera,viewScene,viewCamera,mobile:profile.mobile});
const fx=new Fx(scene,{raycast:(r,n,f)=>world?.raycast(r,n,f)??null,low:pipeline.tier==='low'});fx.onShell=p=>audio.at3(p,()=>audio.play('shell'),500);
const recoil=new Recoil(),crosshair=new Crosshair($('crosshair')),marker=new HitMarker($('hitmarker')),arcs=new DamageArcs(),popups=new Popups(),banners=new Banners();
const scope=Object.assign(document.createElement('div'),{id:'scope'});document.body.append(scope);
const feel={roll:0,dip:0,bob:0,kick:0,stepDist:0,lookX:0,lookY:0,shownPoints:null,lastDir:new THREE.Vector3(0,0,-1)};
function look(dx,dy){camera.rotation.y-=dx;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-(settings.invertY?-dy:dy),-1.5,1.5);feel.lookX+=dx*14;feel.lookY+=dy*14;}
const SURFACE={lobby:'hard',stairs:'wood',balcony:'carpet',booth:'wood',auditorium:'carpet',dressing:'wood',alley:'hard'},ROOM={alley:.04,auditorium:.3,lobby:.2};
const data=await fetch('data/game.json').then(r=>r.json());
for(const [id,w] of Object.entries(data.weapons)){w.id=id;w.fireType??=w.automatic?'Full Auto':'Single Shot';w.startAmmo??=w.reserveMax;}
const map=buildCinema();
let world,session,player,enemies,view,powerups,crate,coop=null,ready=false,active=false,started=false,primary=false,primaryPressed=false,ads=false;
let prompt=null,promptText='',toastUntil=0,announcementUntil=0,hitUntil=0,flashUntil=0,spawn;
let lastPhase='',lastRound=0,frameTime=0,frameCount=0,fps=0,debugVisible=false,repairLeft=0,burstLeft=0,drinkUntil=0;
const grenades=[],projectiles=[],mines=[],decoys=[],gasClouds=[];
const errors=[];let lastShot=null,pendingMelee=null,lastReloadSerial=0,reloadShot=false,mousePrimary=false,mouseAim=false;
const pname=type=>data.powerups[type]?.name??type;
const touchControls=createZombieTouch({
  onLook:(x,y,sensitivity)=>{if(!active||session.phase==='reviving')return;const scale=.005*sensitivity*(ads?.5:1)*(feel.assist?.6:1);look(x*scale,y*scale);},
  onAction:action=>{if(!active||session.phase==='reviving')return;if(action==='reload')reload();if(action==='melee')melee();if(action==='grenade')throwGrenade();if(action==='use')interact();
    if(action==='weapon'){session.switchWeapon();equipView();}if(action==='claymore')placeMine();if(action==='equipment')throwDrummer();},
  onPause:()=>{setActive(false);document.exitPointerLock?.();},
});
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function progress(text,percent){$('load-label').textContent=text;$('load-progress').style.width=percent+'%';}
function toast(text,duration=2.5){$('toast').textContent=text;toastUntil=(session?.time??0)+duration;}
function announce(title,small='STARLIGHT PICTUREHOUSE',duration=4){$('announcement-title').textContent=title;$('announcement-small').textContent=small;$('announcement').style.opacity=1;announcementUntil=session.time+duration;}
function setActive(value){
  active=!!value&&ready&&session.phase!=='gameover';$('menu').hidden=active;document.body.classList.toggle('menu-open',!active);keys.clear();primary=false;primaryPressed=false;ads=false;reloadShot=false;
  mousePrimary=mouseAim=false;if(active)settingsPanel?.close();touchControls.reset();touchControls.setEnabled(active&&session.phase!=='reviving',active);
  if(active&&audio.ctx)audio.start();else if(!active)audio.pause();
  if(active){if(!started){started=true;announce('Round 1','SURVIVE THE NIGHT');audio.play('round');audio.voice('round_1');}else if(session.phase==='preparing')announce('Round '+session.round,'GET READY');}
  else if(started&&session.phase!=='gameover'){$('start').innerHTML='RESUME <span>→</span>';$('restart').hidden=false;$('menu-status').textContent='Paused · Round '+session.round;}
}
function start(){if(!ready||contextLost)return;if(session.phase==='gameover'){if(coop){location.reload();return;}reset();}audio.start();if(touchControls.mode||pad.connected){setActive(true);return;}renderer.domElement.requestPointerLock?.()?.catch?.(()=>toast('Click the game to capture the mouse'));}
$('start').addEventListener('click',start);$('restart').addEventListener('click',()=>{if(coop){location.reload();return;}reset();start();});
renderer.domElement.addEventListener('click',()=>{if(!active)start();});
document.addEventListener('pointerlockchange',()=>{if((touchControls.mode||pad.connected)&&!document.pointerLockElement)return;setActive(document.pointerLockElement===renderer.domElement);});
function suspendRendering(){renderer.setAnimationLoop(null);if(ready){setActive(false);document.exitPointerLock?.();}audio.pause();}
function resumeRendering(){previous=performance.now();lastRendered=0;if(!document.hidden&&!contextLost)renderer.setAnimationLoop(renderFrame);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendRendering();else resumeRendering();});
addEventListener('pagehide',suspendRendering);addEventListener('pageshow',resumeRendering);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;suspendRendering();$('start').disabled=true;$('menu-status').textContent='Graphics paused. Waiting for the browser to restore them…';});
renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;$('start').disabled=!ready;$('menu-status').textContent='Graphics restored · click to resume';resumeRendering();});
addEventListener('blur',()=>{keys.clear();primary=false;ads=false;mouseAim=false;if(started&&active&&!pad.connected){setActive(false);document.exitPointerLock?.();}});
addEventListener('mousemove',e=>{if(!active||document.pointerLockElement!==renderer.domElement)return;const s=ads?.0012*settings.adsSens:.002*settings.sens;look(e.movementX*s,e.movementY*s);});
addEventListener('mousedown',e=>{if(!active||e.sourceCapabilities?.firesTouchEvents||e.target.closest('#touch-controls'))return;if(e.button===0){mousePrimary=primary=true;primaryPressed=true;}if(e.button===2)mouseAim=ads=settings.adsToggle?!mouseAim:true;});
addEventListener('mouseup',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;if(e.button===0)mousePrimary=primary=false;if(e.button===2&&!settings.adsToggle)mouseAim=ads=false;});
addEventListener('contextmenu',e=>e.preventDefault());
keys.onPress(a=>{
  if(!active)return;
  if(a==='reload')reload();if(a==='melee')melee();if(a==='lethal')throwGrenade();if(a==='use')interact();
  if(a==='equipment')placeMine();if(a==='tactical')throwDrummer();if(a==='inspect')view.inspect();
  if(a==='weapon1'||a==='weapon2'||a==='weapon3'){const slot={weapon1:0,weapon2:1,weapon3:2}[a];if(slot<session.inventory.length){session.switchWeapon(slot);equipView();}}
  if(a==='swap'){session.switchWeapon();equipView();}
  if(a==='mute'){audio.enabled=!audio.enabled;toast(audio.enabled?'Sound on':'Sound off');}
});
keys.onKey(code=>{
  if(!active)return;
  if(code==='F3'){debugVisible=!debugVisible;$('debug').hidden=!debugVisible;}
  if(code==='Escape'){setActive(false);document.exitPointerLock?.();}
});
addEventListener('wheel',()=>{if(active){session.switchWeapon();equipView();}});
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const w=innerWidth,h=innerHeight;camera.aspect=viewCamera.aspect=w/h;camera.updateProjectionMatrix();viewCamera.updateProjectionMatrix();pipeline.resize(w,h);},profile.mobile?150:0);});
pad.on('connect',()=>{toast('Controller connected');if(ready&&!active)$('menu-status').textContent='Press START (or A) to play';});

function damage(n,from=null){
  if(!session.damage(n))return;audio.play('hurt');arcs.hit(from,session.time,n/60);feel.kick=Math.min(1,feel.kick+n/90);
  if(session.drinking)stopDrink();
  if(session.phase==='gameover')gameOver();
  else if(session.downState){primary=false;ads=false;announce('You are down','HOLD ON · A TEAMMATE CAN REVIVE YOU',5);}
  else if(session.phase==='reviving'){announce('Back on your feet','SECOND WIND',4);}
}
function gameOver(){
  if(session.phase!=='gameover'){session.phase='gameover';session.lastEvent='Game over';}
  {
    primary=false;ads=false;setActive(false);document.exitPointerLock?.();$('start').innerHTML='TRY AGAIN <span>→</span>';$('restart').hidden=true;
    $('menu-status').textContent='You survived '+session.round+' round'+(session.round>1?'s':'');$('results').hidden=false;$('results').textContent=session.kills+' kills · '+session.headshots+' headshots · '+Math.floor(session.time/60)+'m '+Math.floor(session.time%60)+'s';
    try{const best=Math.max(session.round,+(localStorage.getItem('graveshift.best')||0));localStorage.setItem('graveshift.best',String(best));}catch{}
    audio.voice('game_over');
  }
}
function effect(position,color=0x7a1a14,count=7,size=1.5,speed=100){fx.burst(position,color,count,size,speed);}
function hit(z,head){const dead=z.health<=0;marker.show(session.time,{head,kill:dead});audio.play(head?'headshot':'hit',.7);fx.blood(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?42:25,0)),feel.lastDir,{heavy:dead,color:z.kind==='nova'?0x6f8f2a:0x7a1a14});}
function kill(z,force,position){
  if(z?.gasDeath){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(75,12,8),new THREE.MeshBasicMaterial({color:0x8ca345,transparent:true,opacity:.14,depthWrite:false}));
    mesh.scale.set(1.65,.6,1.65);mesh.position.copy(z.root.position).add(new THREE.Vector3(0,28,0));scene.add(mesh);gasClouds.push({mesh,position:z.root.position.clone(),life:7});
    effect(mesh.position,0x9eb652,15);audio.play('explosion',.6);
    for(const other of [...enemies.list])if(other.root.position.distanceTo(z.root.position)<96)enemies.hurt(other,other.maxHealth,false,false,'explosion');
    if(player.getFeetPosition().distanceTo(z.root.position)<96)damage(45);
  }
  if(z)audio.play('kill',.6);
  if(force){powerups.spawn(force,position??player.getFeetPosition());return;}
  if(z){const type=session.drops.tryDrop(session,{kind:z.kind,playable:z.state!=='barricade'&&!!world.zoneAt(z.root.position.clone().add(new THREE.Vector3(0,40,0))),destroyedWindows:world.barriers.filter(b=>b.count===0).length,boxMoves:crate.moves});if(type)powerups.spawn(type,z.root.position);}
}
function collect(type){
  if(!data.powerups[type])return;
  session.powerup(type);announce(pname(type),'POWER-UP',2.5);audio.play('powerup_grab');audio.voice('pu_'+type);
  const mine=coop?.role!=='client';
  if(type==='blackout'){flashUntil=session.time+.8;audio.play('explosion',.6);if(mine)enemies.blackout(z=>effect(z.root.position,0xc7dba4));}
  if(type==='rebuild'){if(mine)for(const b of world.barriers)world.setBoards(b,b.boards.length);audio.play('repair');}
}
function explode(p,radius,inner,outer,color=0xffb44e,selfScale=100){
  fx.boom(p,radius,color);coop?.boom(p,radius);audio.at3(p,()=>audio.play('explosion',.9),3200);const near=camera.position.distanceTo(p);if(near<radius*2){flashUntil=Math.max(flashUntil,session.time+.08);feel.kick=Math.min(1,feel.kick+.5*(1-near/(radius*2)));}
  for(const z of [...enemies.list]){const d=z.root.position.distanceTo(p);if(d<radius&&world.lineClear(p.clone().add(new THREE.Vector3(0,8,0)),z.root.position.clone().add(new THREE.Vector3(0,30,0))))enemies.hurt(z,THREE.MathUtils.lerp(inner,outer,d/radius),false,false,'explosion');}
  const distance=player.getFeetPosition().add(new THREE.Vector3(0,30,0)).distanceTo(p);if(distance<radius*.8)damage(selfScale*(1-distance/(radius*.8)));
}
function tracer(from,to,color){fx.tracer(from,to,color,.12,1.1);}
const currentSpread=def=>spreadOf(def,{ads,moving:player.horizontalSpeed>70,air:!player.onFloor,crouch:player.crouched,bloom:recoil.bloom});
function shoot(){
  if(!active||!view.ready||view.mode==='raise'||session.busy||session.weaponUnavailable)return false;
  if(session.reloadLeft>0&&session.def.segmentedReload&&session.weapon.mag>0){session.interruptReload();reloadShot=true;return false;}
  if(!session.fire()){if(session.weapon.mag===0&&primaryPressed){audio.dry();reload();}return false;}
  const def=session.def;coop?.shot(def.id);
  view.shoot({ads});audio.shot(def);muzzle.position.copy(camera.position);muzzle.intensity=def.class==='energy'?0:4000;{const k=recoil.kick(def,{ads});camera.rotation.x=Math.min(1.48,camera.rotation.x+k.pitch);camera.rotation.y+=k.yaw;}
  const forward=camera.getWorldDirection(new THREE.Vector3()),gunTip=camera.localToWorld(view.tipOffset().multiplyScalar(36));feel.lastDir.copy(forward);
  if(def.class!=='energy'&&def.class!=='launcher'&&!def.projectileSpeed)fx.shell(camera.localToWorld(new THREE.Vector3(7,-7,-16)),new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),def.class==='shotgun'?0xb03a2a:0xc8a040,player.getFeetPosition().y+1);
  if(def.special==='cone'){
    for(const z of [...enemies.list]){const d=z.root.position.clone().add(new THREE.Vector3(0,40,0)).sub(camera.position);if(d.length()<def.range&&d.normalize().dot(forward)>.7&&world.lineClear(camera.position,z.root.position.clone().add(new THREE.Vector3(0,40,0))))enemies.hurt(z,100000,false,false,'static');}
    effect(camera.position.clone().addScaledVector(forward,100),0x9fe0ff,30,2,400);return true;
  }
  if(def.projectileSpeed>0){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(3,8,6),new THREE.MeshBasicMaterial({color:def.id==='flare'?0xff5530:0xffd28a}));mesh.position.copy(gunTip);scene.add(mesh);
    const light=new THREE.PointLight(def.id==='flare'?0xff5530:0xffb060,2000,300,1.6);mesh.add(light);
    projectiles.push({mesh,velocity:forward.clone().multiplyScalar(def.projectileSpeed),def,life:4});return true;
  }
  const pellets=Math.max(1,def.pellets),spread=currentSpread(def);
  for(let i=0;i<pellets;i++){
    const direction=forward.clone();if(spread>0){direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();}
    const ray=new THREE.Ray(camera.position.clone(),direction),wall=world.raycast(ray,1,6000);
    let far=wall?.distance??6000,pierce=def.pierce??1,end=null;const ignore=new Set();
    while(pierce-->0){
      const target=enemies.rayHit(ray,far,ignore);if(!target)break;ignore.add(target.z);end=target.point;
      lastShot={origin:ray.origin.toArray(),direction:direction.toArray(),wallDistance:wall?.distance??null,target:{id:target.z.id,head:target.head,distance:target.distance}};
      const dmg=falloff(def,target.distance);enemies.hurt(target.z,dmg*(target.head?Math.max(1,def.headMultiplier):1),target.head,false,def.explosionRadius?'explosion':'bullet');
      if(def.explosionRadius){explode(target.point,def.explosionRadius,def.explosionInnerDamage,def.explosionOuterDamage,def.tracer?new THREE.Color(def.tracer).getHex():0xffb44e,def.class==='energy'?0:60);break;}
    }
    if(!end&&wall){end=wall.position;fx.impact(wall,direction,{sparks:def.class==='energy'});if(def.explosionRadius)explode(wall.position,def.explosionRadius,def.explosionInnerDamage,def.explosionOuterDamage,def.tracer?new THREE.Color(def.tracer).getHex():0xffb44e,def.class==='energy'?0:60);}
    if(!lastShot||!end)lastShot={origin:ray.origin.toArray(),direction:direction.toArray(),wallDistance:wall?.distance??null,target:null};
    if(def.tracer)tracer(gunTip,end??camera.position.clone().addScaledVector(direction,3000),new THREE.Color(def.tracer).getHex());
    else if(i<3)fx.tracer(gunTip,end??camera.position.clone().addScaledVector(direction,3000),0xffe6b0,.05,.5);
  }
  return true;
}
async function equipView(){reloadShot=false;await view.equip(session.def);}
function reload(){if(!view.ready)return;const empty=session.weapon.mag===0;if(session.reload()){burstLeft=0;ads=false;lastReloadSerial=session.reloadSerial;view.reload(empty,session.reloadDuration,session.reloadStage);audio.reload(session.reloadStage,session.reloadDuration);}}
function melee(){
  if(!active||session.busy||session.weaponUnavailable||!view.ready)return false;
  const charge=!!meleeTarget(),strike=view.melee(session.axe?'axe':'knife',charge);if(!strike)return false;
  session.cancelReload();session.meleeLeft=strike.duration;burstLeft=0;reloadShot=false;ads=false;primaryPressed=false;
  pendingMelee={at:session.time+strike.delay,damage:strike.damage};audio.knife('swing');return true;
}
function meleeTarget(){
  const direction=camera.getWorldDirection(new THREE.Vector3());let nearest=null;
  for(const z of enemies.list){const target=z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?45:22,0)),delta=target.clone().sub(camera.position);if(delta.length()<94&&delta.normalize().dot(direction)>.45&&world.lineClear(camera.position,target)){if(!nearest||z.root.position.distanceTo(camera.position)<nearest.root.position.distanceTo(camera.position))nearest=z;}}
  return nearest;
}
function resolveMelee(){
  if(!pendingMelee||session.time<pendingMelee.at)return;const strike=pendingMelee;pendingMelee=null;
  if(session.phase==='reviving'||session.phase==='gameover')return;
  const nearest=meleeTarget();
  if(nearest){enemies.hurt(nearest,strike.damage,false,true);audio.knife('hit');}
  else{const ray=new THREE.Ray(camera.position.clone(),camera.getWorldDirection(new THREE.Vector3())),wall=world.raycast(ray,0,94);if(wall){audio.knife('wall');fx.impact(wall,ray.direction);}}
}
function throwGrenade(){
  if(!active||session.grenades<=0||session.busy)return false;session.grenades--;
  const mesh=grenadeModel?instance(grenadeModel,6,'max'):new THREE.Mesh(new THREE.SphereGeometry(3.5,8,6),new THREE.MeshStandardMaterial({color:0x4a5039}));mesh.position.copy(camera.position);scene.add(mesh);
  grenades.push({mesh,velocity:camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(480).add(new THREE.Vector3(0,140,0)),life:2.6});return true;
}
function throwDrummer(){
  if(!active||!session.useEquipment('drummers'))return false;
  const mesh=drummerToy();mesh.scale.setScalar(1.5);mesh.position.copy(camera.position);scene.add(mesh);
  decoys.push({mesh,velocity:camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(420).add(new THREE.Vector3(0,120,0)),life:8,landed:false});return true;
}
function placeMine(){
  if(!active||!session.useEquipment('tripmines'))return false;
  const f=camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize(),p=player.getFeetPosition().addScaledVector(f,40);const ground=world.raycast(new THREE.Ray(p.clone().add(new THREE.Vector3(0,40,0)),new THREE.Vector3(0,-1,0)),0,200);if(ground)p.y=ground.position.y;
  const mesh=mineModel?instance(mineModel,14,'max'):new THREE.Mesh(new THREE.CylinderGeometry(7,7,3,12),new THREE.MeshStandardMaterial({color:0x445040}));mesh.position.copy(p);scene.add(mesh);
  const blink=new THREE.Mesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:0xff2020}));blink.position.y=5;mesh.add(blink);
  mines.push({mesh,blink,armed:session.time+.8});audio.play('buy');return true;
}
function findPrompt(){
  prompt=null;promptText='';let distance=110;
  for(const e of world.interactions){
    if(e.kind==='crate'&&!crate.available(e.crate))continue;
    if(e.kind==='door'&&session.openDoors.has(e.door))continue;
    if(e.kind==='power'&&session.power)continue;
    const dist=camera.position.distanceTo(e.position);if(dist<distance){distance=dist;prompt=e;}
  }
  for(const b of world.barriers){const d=camera.position.distanceTo(b.position.clone().add(new THREE.Vector3(0,25,0)));if(d<100&&d<distance){prompt={barrier:b};distance=d;}}
  const mate=coop?.reviveTarget(camera.position);if(mate){prompt={revive:mate};promptText=coop.reviveText(mate);return;}
  if(!prompt)return;
  if(prompt.barrier){promptText=prompt.barrier.count<prompt.barrier.boards.length?'Hold F to rebuild barricade':'Barricade secured';return;}
  const e=prompt;
  if(e.kind==='door'){const d=world.doors.get(e.door);promptText='Clear the way · '+d.cost;}
  if(e.kind==='wallbuy'){const d=data.weapons[e.weapon],owned=session.inventory.find(w=>w.id===d.id&&!w.lost);promptText=owned?d.name+' ammo · '+(owned.upgraded?data.refinery.ammoPrice:Math.ceil(d.price/2)):d.name+' · '+d.price;}
  if(e.kind==='equipment'){const d=data.equipment[e.weapon];promptText=session.tripminesOwned?d.name+' owned · 4 to place':d.name+' · '+d.price;}
  if(e.kind==='axe')promptText=session.axe?data.axe.name+' equipped':data.axe.name+' · '+data.axe.price;
  if(e.kind==='perk'){const p=data.perks[e.perk];promptText=session.perks.has(e.perk)?p.name+' — already yours':p.needsPower&&!session.power?'The power is out':p.name+' · '+p.price;}
  if(e.kind==='power')promptText='Throw the main power switch';
  if(e.kind==='crate'){const roll=crate.at(e.crate);promptText=roll?(roll.ready?(roll.moth?'The crate is leaving…':'Take '+crate.name(roll.weapon)):'Rolling…'):data.crate.name+' · '+(session.effects.clearance>session.time?data.crate.salePrice:data.crate.price);}
  if(e.kind==='refinery')promptText=session.refinery?(session.time>=session.refinery.readyAt?'Take '+data.weapons[session.refinery.weapon.id].upgrade.name+' · '+Math.ceil(session.refinery.expires-session.time)+'s':'Refining…'):!session.power?'The power is out':session.weapon.upgraded?'Weapon already refined':!data.weapons[session.weapon.id]?.upgrade?'Cannot refine this':data.refinery.name+' · '+data.refinery.price;
}
function interact(){
  if(!active||session.busy)return false;findPrompt();if(!prompt)return false;
  if(prompt.revive)return false;if(prompt.barrier)return repair(prompt.barrier);
  const e=prompt,pay=n=>{if(!session.spend(n)){toast('Not enough points');audio.play('deny');return false;}audio.play('buy');return true;};
  if(e.kind==='axe'){if(session.axe||!pay(data.axe.price))return false;session.axe=true;toast(data.axe.name+' · V to swing');return true;}
  if(e.kind==='door'){const d=world.doors.get(e.door);if(session.openDoors.has(e.door)||!pay(d.cost))return false;session.openDoors.add(e.door);session.flags.add(d.flag);world.setDoors(session);coop?.door(e.door);audio.play('door');toast('The way is clear');return true;}
  if(e.kind==='equipment'){if(session.tripminesOwned){toast('Press 4 to place a tripmine');return false;}if(!session.buyTripmines()){toast('Not enough points');audio.play('deny');return false;}audio.play('buy');toast('Tripmines · press 4 to place');return true;}
  if(e.kind==='wallbuy'){
    const d=data.weapons[e.weapon];if(session.refinery?.weapon===session.weapon)return false;
    const owned=session.inventory.find(w=>w.id===d.id&&!w.lost),cost=owned?(owned.upgraded?data.refinery.ammoPrice:Math.ceil(d.price/2)):d.price;
    if(!pay(cost))return false;
    if(owned)owned.reserve=owned.upgraded?d.upgrade?.reserveMax??d.reserveMax:d.reserveMax;else{session.giveWeapon(d.id);equipView();}toast(owned?'Ammo refilled':d.name);return true;
  }
  if(e.kind==='perk'){
    const id=e.perk,p=data.perks[id];if(session.perks.has(id)||(p.needsPower&&!session.power))return false;
    if(id==='perk_wind'&&session.revives>=3){toast(p.name+' has run dry');return false;}if(!pay(p.price))return false;
    if(!session.drink(id))return false;primary=false;primaryPressed=false;ads=false;burstLeft=0;reloadShot=false;
    view.drink(p.color,session.drinkLeft);drinkUntil=session.time+session.drinkLeft;audio.play('drink');audio.perk(id);toast(p.name+' — '+p.blurb,4);return true;
  }
  if(e.kind==='power'&&!session.power){powerOn();coop?.power();return true;}
  if(e.kind==='crate'){
    if(crate.at(e.crate)){if(session.refinery?.weapon===session.weapon)return false;const weapon=crate.take(e.crate);if(!weapon)return false;
      if(weapon==='drummer'){session.giveDrummers();toast('Wind-up Drummers · X to throw');}else{session.giveWeapon(weapon);equipView();toast(data.weapons[weapon].name);}return true;}
    const cost=session.effects.clearance>session.time?data.crate.salePrice:data.crate.price;
    if(session.points<cost){toast('Not enough points');audio.play('deny');return false;}
    if(!crate.start(e.crate))return false;session.spend(cost);return true;
  }
  if(e.kind==='refinery'){
    if(session.refinery){if(!session.takeRefined())return false;equipView();toast(session.def.name);return true;}
    if(!session.beginRefine()){if(session.power&&!session.weapon.upgraded&&session.points<data.refinery.price){toast('Not enough points');audio.play('deny');}return false;}
    ads=false;primary=false;burstLeft=0;reloadShot=false;audio.play('refinery');toast('Refining… come back for it.');view.pivot.visible=false;return true;
  }
  return false;
}
function powerOn(){if(session.power)return;session.power=true;session.flags.add('power_on');ambient.intensity=1.1;announce('Power restored','THE SHOW GOES ON');audio.play('power');audio.voice('power_on');}
function respawnMe(){session.revive();player.setSpawn(vector(spawn.position));player.respawn();camera.rotation.set(0,spawn.yaw,0);announce('Back in the fight','NEW ROUND',3);}
function stopDrink(){view.stopDrink();drinkUntil=0;}
function repair(b){if(b.count>=b.boards.length||repairLeft>0)return false;repairLeft=.75;world.setBoards(b,b.count+1);coop?.board(b);if(b.rewardRound!==session.round){b.rewardRound=session.round;b.reward=0;}if(b.reward<50*session.round){session.addPoints(10);b.reward+=10;}audio.play('repair');return true;}
function clearGroup(group){for(const item of group){item.mesh.removeFromParent();item.mesh.traverse(o=>{o.geometry?.dispose();});}group.length=0;}
function reset(){
  pendingMelee=null;lastReloadSerial=0;reloadShot=false;drinkUntil=0;
  touchControls.reset();mousePrimary=mouseAim=false;toastUntil=0;announcementUntil=0;hitUntil=0;flashUntil=0;primary=false;primaryPressed=false;ads=false;keys.clear();
  session.reset();enemies.reset();world.reset(session);player.setSpawn(vector(spawn.position));player.respawn();camera.rotation.set(0,spawn.yaw,0);
  powerups.reset();crate.reset();view.stopDrink();
  for(const g of [grenades,projectiles,mines,decoys,gasClouds])clearGroup(g);fx.clear();arcs.clear();popups.clear();recoil.reset();feel.shownPoints=null;feel.kick=0;
  renderer.domElement.style.filter='';started=false;repairLeft=0;burstLeft=0;lastPhase='';lastRound=0;ambient.intensity=.7;view.currentId=null;equipView();$('results').hidden=true;
  $('menu-status').textContent=touchControls.mode?'Tap to start':'Click to capture the mouse';
}
function update(dt){
  if(!ready)return;
  touchControls.setEnabled(active&&session.phase!=='reviving'&&session.phase!=='gameover',active&&session.phase!=='gameover');
  const touch=touchControls.input.read(),gp=pad.read();
  if(gp.pressed.start){if(active){setActive(false);}else start();}
  if(!active&&gp.pressed.a&&ready)start();
  primary=mousePrimary||touch.fire||gp.fire;primaryPressed ||= touch.firePressed||gp.pressed.fire;const wasAds=ads;ads=mouseAim||touch.aim||gp.aim;
  feel.assist=null;if(active&&settings.aimAssist&&(pad.connected||touchControls.mode)&&enemies.list.length){feel.assist=assistTarget(camera,enemies.list.filter(z=>z.state!=='barricade').map(z=>z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?44:24,0))));if(feel.assist&&ads&&!wasAds&&world.lineClear(camera.position,feel.assist.point))pullToward(camera,feel.assist);}
  if(active||coop?.live()){
    if(active&&(gp.lookX||gp.lookY)){const s=(ads?1.6:3.2)*dt*settings.padSens*(feel.assist?.55:1);look(gp.lookX*s,gp.lookY*s);}
    if(!active){}else{if(gp.pressed.reload)reload();if(gp.pressed.use)interact();if(gp.pressed.melee)melee();if(gp.pressed.grenade)throwGrenade();if(gp.pressed.tactical)throwDrummer();if(gp.pressed.mine)placeMine();if(gp.pressed.swap){session.switchWeapon();equipView();}}
    session.update(dt);
    if(session.phase!=='gameover'){
      resolveMelee();
      if(session.reloadLeft>0&&session.reloadSerial!==lastReloadSerial){lastReloadSerial=session.reloadSerial;view.reload(false,session.reloadDuration,session.reloadStage);audio.reload(session.reloadStage,session.reloadDuration);}
      const forward=keys.axis('forward','back')+touch.forward+gp.forward,strafe=keys.axis('right','left')+touch.strafe+gp.strafe;
      const moving=Math.hypot(forward,strafe)>.01,sprint=(keys.held('sprint')&&forward>.3||touch.sprint||gp.sprint&&forward>.3)&&!ads&&!session.reloadLeft&&!session.meleeLeft&&!session.drinking;
      {const k=moveScale(session.def,ads)*(session.perks.has('perk_stride')?1.1:1);player.moveSpeed=190*k;player.sprintSpeed=285*k*(session.perks.has('perk_stride')?1.06:1);}
      player.update(dt,session.phase==='reviving'||session.downState||!active?{}:{forward:THREE.MathUtils.clamp(forward,-1,1),strafe:THREE.MathUtils.clamp(strafe,-1,1),sprint,crouch:keys.held('crouch')||touch.crouch||gp.crouch,jump:keys.held('jump')||gp.jump,jumpPressed:touch.jump});
      moveFeel(dt,moving,sprint,strafe);
      if(drinkUntil&&!session.drinking){view.stopDrink();drinkUntil=0;}
      view.update(dt,{moving,sprint,ads,reloading:session.reloadLeft>0,time:session.time,strafe,lookX:feel.lookX,lookY:feel.lookY,air:!player.onFloor,sliding:player.sliding,quiet:!settings.shake});feel.lookX=feel.lookY=0;
      view.pivot.visible=!session.weaponUnavailable&&!session.downState;
      if(!sprint&&session.phase!=='reviving'&&(primaryPressed||(primary&&session.def.automatic)||burstLeft>0||reloadShot)){
        if(shoot()){reloadShot=false;if(burstLeft>0)burstLeft--;else if(session.def.fireType==='3-Round Burst')burstLeft=2;}
      }
      primaryPressed=false;
      if(coop?.role==='client')enemies.puppets(dt);else enemies.update(dt,player.getFeetPosition());coop?.update(dt);
      repairLeft=Math.max(0,repairLeft-dt);findPrompt();if(active&&(keys.held('use')||touch.use||gp.useHeld)){if(prompt?.barrier)repair(prompt.barrier);if(prompt?.revive)coop.holdRevive(prompt.revive,dt);}
      if(session.round!==lastRound||session.phase!==lastPhase){
        if(session.phase==='fighting'){announce(session.dogRound?'The hounds are loose':'Round '+session.round,session.dogRound?'HOUND NIGHT':'SURVIVE');audio.play(session.dogRound?'hounds':'round');audio.voice(session.dogRound?'hounds':'round_'+Math.min(session.round,10));}
        else if(session.phase==='preparing'&&session.round>1){announce('Round survived','RELOAD · REBUILD · REGROUP');audio.play('round_end');}
        lastRound=session.round;lastPhase=session.phase;
      }
      crate.update(dt);world.update(dt,session);
      let gassed=false;
      for(const g of [...gasClouds]){g.life-=dt;g.mesh.material.opacity=.14*Math.min(1,g.life/2);g.mesh.rotation.y+=dt*.2;if(player.getFeetPosition().distanceTo(g.position)<125)gassed=true;if(g.life<=0){g.mesh.removeFromParent();g.mesh.geometry.dispose();g.mesh.material.dispose();gasClouds.splice(gasClouds.indexOf(g),1);}}
      renderer.domElement.style.filter=(gassed?'blur(3px) ':'')+(session.downState?'grayscale(1) brightness(.6)':'');
      powerups.update(dt,player.getFeetPosition(),session.phase!=='reviving'&&!session.downState,(a,b)=>world.lineClear(a,b));
      const bounce=(g,dt)=>{g.velocity.y-=650*dt;const travel=g.velocity.clone().multiplyScalar(dt),ray=new THREE.Ray(g.mesh.position.clone(),travel.clone().normalize()),h=world.raycast(ray,0,travel.length()+4);if(h){g.velocity.y=Math.abs(g.velocity.y)*.35;g.velocity.x*=-.35;g.velocity.z*=-.35;if(Math.abs(g.velocity.y)<40){g.velocity.set(0,0,0);g.landed=true;}}else g.mesh.position.add(travel);};
      for(const g of [...grenades]){g.life-=dt;bounce(g,dt);g.mesh.rotation.x+=dt*8;if(g.life<=0){explode(g.mesh.position.clone(),300,1500,75,0xffb347,180);g.mesh.removeFromParent();grenades.splice(grenades.indexOf(g),1);}}
      for(const d of [...decoys]){d.life-=dt;if(!d.landed)bounce(d,dt);else{d.mesh.userData.sticks.forEach((s,i)=>s.rotation.x=Math.sin(session.time*30+i*3)*.6);if(Math.floor(session.time*4)!==d.beat){d.beat=Math.floor(session.time*4);audio.knife('wall');}}
        if(d.life<=0){explode(d.mesh.position.clone(),260,2000,200,0xffd070,120);d.mesh.removeFromParent();decoys.splice(decoys.indexOf(d),1);}}
      for(const p of [...projectiles]){p.life-=dt;const travel=p.velocity.clone().multiplyScalar(dt),ray=new THREE.Ray(p.mesh.position.clone(),travel.clone().normalize()),dist=travel.length(),wall=world.raycast(ray,0,dist),z=enemies.rayHit(ray,wall?.distance??dist);
        if(wall||z||p.life<=0){const at=z?.point??wall?.position??p.mesh.position;explode(at,p.def.explosionRadius,p.def.explosionInnerDamage,p.def.explosionOuterDamage,p.def.id==='flare'?0xff6a40:0xffb44e,90);p.mesh.removeFromParent();projectiles.splice(projectiles.indexOf(p),1);}else p.mesh.position.add(travel);}
      for(const m of [...mines]){m.blink.visible=Math.floor(session.time*3)%2===0;if(session.time<m.armed)continue;if(enemies.list.some(z=>z.state!=='barricade'&&z.root.position.distanceTo(m.mesh.position)<70)){explode(m.mesh.position.clone().add(new THREE.Vector3(0,12,0)),220,2500,400,0xffa040,0);m.mesh.removeFromParent();mines.splice(mines.indexOf(m),1);}}
      fx.update(dt);
    }
  }
  muzzle.intensity=Math.max(0,muzzle.intensity-dt*40000);flashlight.intensity=session.power?0:1400;
  camera.fov=THREE.MathUtils.damp(camera.fov,(ads&&!session.drinking&&!session.meleeLeft&&!session.reloadLeft?(session.def.adsFov||56)/78:player?.sliding?1.06:1)*settings.fov,12,dt);camera.updateProjectionMatrix();
  audio.listen(camera);
  hud();
}
const roman=n=>n<=5?'I'.repeat(n):String(n);
function hud(){
  const s=session,w=s.weapon;
  $('round').textContent=roman(s.round);$('round').classList.toggle('hounds',s.dogRound);$('remaining').textContent=s.phase==='preparing'?'STARTS IN '+Math.max(0,Math.ceil(s.countdown)):(s.total-s.killed)+' REMAINING';
  $('points').textContent=s.points.toLocaleString();$('mag').textContent=s.weaponUnavailable?'—':w.mag;$('reserve').textContent=s.weaponUnavailable?'—':w.reserve;
  $('weapon-name').textContent=s.weaponUnavailable?(s.refinery?'Weapon in the Refinery':'No weapon'):s.def.name;$('weapon-name').classList.toggle('refined',!!w.upgraded);
  $('grenades').textContent='G · '+s.grenades+' FRAGS'+(s.tripminesOwned?'  |  4 · '+s.tripmines+' MINES':'')+(s.drummersOwned?'  |  X · '+s.drummers+' DRUMMERS':'');
  $('reload-label').textContent=s.weaponUnavailable?'':s.reloadLeft>0?'RELOADING':w.mag===0?(pad.connected?'X TO RELOAD':bindLabel('reload')+' TO RELOAD'):'';
  if(touchControls.mode){$('grenades').textContent=$('grenades').textContent.replace('G · ','').replace('4 · ','').replace('X · ','');$('reload-label').textContent=$('reload-label').textContent.replace(/^.* TO RELOAD$/,'TAP RELOAD');}
  $('health-fill').style.width=(100*s.health/s.maxHealth)+'%';$('health-label').textContent=Math.ceil(s.health)+' / '+s.maxHealth;
  $('hurt').style.opacity=s.health<s.maxHealth?(1-s.health/s.maxHealth)*.8:0;marker.update(s.time);$('flash').style.opacity=Math.max(0,flashUntil-s.time);pipeline.setGrade('hurt',s.health<s.maxHealth?1-s.health/s.maxHealth:0);
  const scoped=s.def.class==='sniper'&&view.aim>.92&&active&&!s.weaponUnavailable;scope.style.opacity=scoped?1:0;if(scoped)view.pivot.visible=false;
  crosshair.set(player?currentSpread(s.def):.01,camera.fov,{hidden:!active||view.aim>.5||s.weaponUnavailable||s.phase==='reviving',hot:!!feel.assist&&feel.assist.angle<.03});arcs.update(camera,s.time);banners.update();
  $('mag').classList.toggle('low',!s.weaponUnavailable&&w.mag<=Math.max(1,s.def.clipSize*.25));$('reserve').classList.toggle('low',!s.weaponUnavailable&&w.reserve===0);
  if(feel.shownPoints!==null&&s.points!==feel.shownPoints){const d=s.points-feel.shownPoints;popups.add((d>0?'+':'')+d,d<0?'bad':d>=100?'head':'');}feel.shownPoints=s.points;
  const key=touchControls.mode?'USE':pad.connected?'X':bindLabel('use');
  $('prompt').innerHTML=active&&promptText?(promptText==='Barricade secured'?promptText:'<kbd>'+key+'</kbd> '+promptText.replace('Hold F','Hold '+key)):'';
  if(toastUntil<s.time)$('toast').textContent='';if(announcementUntil<s.time)$('announcement').style.opacity=0;
  const perkHtml=[...s.perks].map(id=>`<span class="perk" title="${data.perks[id].name}" style="background:${data.perks[id].color}">${data.perks[id].icon}</span>`).join('');if($('perks').innerHTML!==perkHtml)$('perks').innerHTML=perkHtml;
  const effectHtml=Object.entries(s.effects).filter(([k,t])=>t>s.time&&data.powerups[k]).map(([k,t])=>`<span class="powerup-timer ${t-s.time<5&&Math.floor(s.time*4)%2?'expiring':''}" style="--c:${data.powerups[k].color}"><b>${data.powerups[k].glyph}</b><span>${Math.ceil(t-s.time)}s</span></span>`).join('');if($('effects').innerHTML!==effectHtml)$('effects').innerHTML=effectHtml;
  $('location').textContent=zoneNames[world.zoneAt(player.getFeetPosition().add(new THREE.Vector3(0,35,0)))]??'Starlight Picturehouse';
  $('objective').textContent=!s.power?'Find the projection booth and restore the power':s.perks.size<2?'Visit the drink machines':'';
  if(coop){const h=coop.hud();if($('mates').innerHTML!==h)$('mates').innerHTML=h;}
  if(debugVisible)$('debug').textContent=`${fps} FPS · ${renderer.info.render.calls} calls\n${camera.position.toArray().map(v=>v.toFixed(1)).join(', ')}\n${enemies.list.length} undead · ${world.navDisabled.size} blocked polygons`;
}
function getState(){return {ready,active,started,input:{touch:touchControls.getState(),primary,ads,gamepad:pad.connected},...(session?session.snapshot():{}),player:player?{...player.state,rotation:camera.rotation.toArray().slice(0,3),position:camera.position.toArray(),feet:player.getFeetPosition().toArray()}:null,enemies:enemies?.snapshot()??[],prompt:promptText,
  barriers:world?.barriers.map(b=>({id:b.id,count:b.count,position:b.position.toArray(),inside:b.inside.toArray(),zone:b.zone}))??[],doors:world?[...world.doors.values()].map(d=>({name:d.name,cost:d.cost,flag:d.flag,open:session.openDoors.has(d.name),triggers:d.triggers})):[],
  performance:{fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},viewmodelReady:view?.ready??false,coop:coop?.state()??null,errors:[...errors]};}
const entityList=()=>map.kit.entities.filter(e=>!['zone','screen','poster'].includes(e.type));
const debug={getState,setActive,pause:()=>setActive(false),resume:()=>setActive(true),reset,teleportPlayer:p=>player.setPosition(vector(p)),lookAt:p=>camera.lookAt(vector(p)),damagePlayer:damage,grantPoints:n=>session.points+=n,interact,shoot,reload,melee,
  giveWeapon:id=>{session.giveWeapon(id);equipView();},spawnEnemy:(p,kind)=>enemies.spawn(vector(p),null,kind).id,clearEnemies:()=>{for(const z of [...enemies.list])enemies.hurt(z,999999);},collectPowerup:collect,
  step:seconds=>{for(let t=0;t<seconds;t+=1/60)update(Math.min(1/60,seconds-t));},navigationPath:(a,b)=>world.path(vector(a),vector(b)).map(v=>v.toArray()),getEntities:entityList,
  showCollision:value=>{world.collision.setDebugVisible(value);scene.add(world.collision.mesh);},
  memoryState:()=>({...assetDiagnostics(),geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderedFrames,contextLost}),
  assetLog,simulateContextLoss:()=>renderer.forceContextLoss(),simulateContextRestore:()=>renderer.forceContextRestore(),
  setAutoSpawn:value=>{enemies.autoSpawn=value;enemies.autoRounds=value;},useEquipment:kind=>kind==='tripmines'?placeMine():throwDrummer(),giveDrummers:()=>session.giveDrummers(),
  audioState:()=>audio.snapshot(),weaponVisual:()=>view.snapshot(),lastShot:()=>lastShot,setInvulnerable:value=>{session.effects.invulnerable=value?Infinity:0;},
  aimAtEnemy:(id,head=true)=>{const z=enemies.list.find(z=>z.id===id);if(z)camera.lookAt(head?enemies.headPosition(z):z.root.position.clone().add(new THREE.Vector3(0,z.kind==='zombie'?40:25,0)));},
  specialState:()=>({gasClouds:gasClouds.length,box:crate.snapshot().find(b=>b.id===world.activeBox.id)?.roll??null,boxLocation:world.activeBox.id,boxes:crate.snapshot(),boxMoves:crate.moves,clearance:!!world.clearanceSale,pickups:powerups.snapshot()}),
  dropPowerup:(type,p)=>{powerups.spawn(type,vector(p));return powerups.snapshot();},damageEnemy:(id,n=999999)=>{const z=enemies.list.find(z=>z.id===id);if(z)enemies.hurt(z,n);},grantScore:n=>session.addPoints(n),
  setBoards:(id,count)=>world.setBoards(world.barriers.find(b=>b.id===id),count),
  setRound:n=>{enemies.reset();while(session.round<n)session.nextRound();session.countdown=0;session.spawned=0;session.killed=0;},
  openAllDoors:()=>{for(const d of world.doors.values()){session.openDoors.add(d.name);session.flags.add(d.flag);}world.setDoors(session);},
  setPower:on=>{session.power=!!on;if(on){session.flags.add('power_on');ambient.intensity=1.1;}},
  interactWith:(kind,key)=>{const e=world.interactions.find(i=>i.kind===kind&&(key==null||i.door===key||i.perk===key||i.weapon===key));if(!e)return false;camera.position.copy(e.position);return interact();},
  coopRevive:()=>{const m=coop?.reviveTarget(camera.position);if(m)coop.holdRevive(m,3.1);return !!m;},
  data:()=>data};
globalThis.game={debug};
// ---------- co-op (index.html?host=CODE / ?join=CODE) ----------
const query=new URLSearchParams(location.search),savedName=(()=>{try{return JSON.parse(localStorage.getItem('graveshift.class')||'{}').name||'';}catch{return '';}})();
let api=null;
async function setupCoop(role,room){
  try{
    coop=await createCoop({role,room,name:savedName||'Guest',scene,data,session,enemies,world,player,camera,powerups,audio,fx,toast,announce,hurt:damage,collect,powerOn,gameOver,respawn:respawnMe,started:()=>started,status:t=>{$('coop-status').textContent=role==='host'?`Room ${room} · ${t}`:t;}});
    $('mode-label').textContent='CO-OP';const link=location.origin+location.pathname+'?join='+room;
    if(role==='host')$('coop-status').innerHTML=`Co-op room <b>${room}</b> · share <a href="${link}" style="color:#e0b060">${link}</a> · up to 4 players`;else $('coop-status').textContent='Joined co-op room '+room;
    $('coop').hidden=true;addEventListener('pagehide',()=>{coop.leave();if(role==='host'&&api?.me)api.call('DELETE','rooms/'+room);});
    if(role==='host'&&api?.on&&await api.signIn(savedName||'Guest')){const beat=()=>{if(!coop.over)api.call('POST','rooms',{code:room,playlist:'coop',map:'cinema',mode:'coop',size:2,started,humans:1+coop.mates.size,free:3-coop.mates.size});};beat();setInterval(beat,15000);}
  }catch(e){
    console.warn('co-op',e);coop=null;session.coop=false;enemies.autoSpawn=enemies.autoRounds=undefined;enemies.remoteHurt=enemies.pick=enemies.spawnNear=null;
    $('coop-status').textContent=`Could not ${role==='host'?'open':'join'} room ${room} · playing solo`;
  }
}
function coopMenu(){
  $('coop-name').value=savedName;const go=q=>{const n=$('coop-name').value.trim().replace(/[^\w .\-]/g,'').slice(0,14);try{const s=JSON.parse(localStorage.getItem('graveshift.class')||'{}');s.name=n;localStorage.setItem('graveshift.class',JSON.stringify(s));}catch{}location.search=q;};
  $('coop-host').addEventListener('click',()=>go('?host='+Math.random().toString(36).slice(2,7).toUpperCase()));
  $('coop-join').addEventListener('click',()=>{const c=$('coop-code').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(c)go('?join='+c);});
  $('coop-quick').hidden=!api?.on;$('coop-quick').addEventListener('click',async()=>{
    $('coop-status').textContent='Looking for a co-op game…';const r=await api.signIn($('coop-name').value.trim()||'Guest')?await api.call('POST','quick',{playlist:'coop',map:'cinema',mode:'coop',size:2},6000):null;
    if(r?.join)go('?join='+r.join);else if(r?.host)go('?host='+r.host);else $('coop-status').textContent=r?.error?'Matchmaking: '+r.error:'Online services are not reachable · host a room and share the link';
  });
}
let grenadeModel=null,mineModel=null;
// Camera and sound response to movement: footsteps by surface, bob, landing dip, strafe roll, hit kick.
function moveFeel(dt,moving,sprint,strafe){
  const zone=world.zoneAt(player.getFeetPosition().add(new THREE.Vector3(0,35,0)));
  if(zone!==feel.zone){feel.zone=zone;audio.setReverb(ROOM[zone]??.14);}
  for(const e of player.drain()){
    if(e==='slide')audio.play('slide');if(e==='mantle')audio.play('mantle');
    if(e[0]==='land'){const k=Math.min(1,e[1]/600);audio.play('land',.4+k*.6);view.land(k);feel.dip=Math.min(1,feel.dip+k);}
  }
  if(player.onFloor&&!player.sliding&&moving){feel.stepDist+=player.horizontalSpeed*dt;if(feel.stepDist>(sprint?96:78)){feel.stepDist=0;audio.step(SURFACE[zone]??'hard',player.crouched?.35:sprint?1:.7);}}
  feel.dip=THREE.MathUtils.damp(feel.dip,0,8,dt);feel.kick=THREE.MathUtils.damp(feel.kick,0,6,dt);
  feel.roll=THREE.MathUtils.damp(feel.roll,settings.shake?(-THREE.MathUtils.clamp(strafe,-1,1)*.012+(player.sliding?.05:0)+Math.sin(session.time*40)*feel.kick*.02):0,10,dt);
  feel.bob=player.onFloor&&moving&&settings.shake&&!player.sliding?feel.bob+dt*(sprint?13:9):feel.bob;
  camera.rotation.z=feel.roll+(session.downState?.5:0);if(session.downState)camera.position.y-=34;camera.position.y+=(settings.shake?Math.abs(Math.sin(feel.bob))*(sprint?1.5:.8):0)-feel.dip*7;
  const rc=recoil.update(dt);camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x+rc.pitch,-1.5,1.5);camera.rotation.y+=rc.yaw;
}
const settingsPanel=mountSettings({anchor:$('restart'),keys,actions:['forward','back','left','right','jump','crouch','sprint','reload','use','melee','lethal','tactical','equipment','swap','weapon1','weapon2','weapon3','inspect','mute']});
onSettings(()=>{camera.fov=settings.fov;camera.updateProjectionMatrix();});
try{
  progress('Unlocking the doors',5);session=new Session(data);world=new World(scene,data,map);await world.load(progress);
  spawn=world.spawn;world.setDoors(session);
  player=new PlayerController(camera,world.physics,{spawn:vector(spawn.position),spawnIsEye:false,radius:14,height:70,eyeHeight:60,moveSpeed:190,sprintSpeed:285,crouchSpeed:95,gravity:800,jumpHeight:39,fallResetY:-800,maxSubSteps:12,groundSnapSpeed:10});
  camera.rotation.set(0,spawn.yaw,0);
  progress('Waking the dead',80);view=new ViewModel(viewScene,data,audio);
  enemies=new Enemies(scene,world,data,session,{damage:(n,at,z,who)=>{if(coop?.hurtRemote(who,n,at))return;damage(n,at);},kill,hit,sound:(kind,p,v=1)=>audio.at3(p,()=>{if(kind==='growl')audio.growl(v);else audio.play(kind,v);},kind==='step'?700:1500)});
  enemies.lureTarget=z=>{const d=decoys.find(d=>d.landed);return d?d.mesh.position.clone():null;};
  world.actors=()=>enemies.list;
  powerups=new Powerups(scene,data,audio,(type,at,item)=>{if(coop)coop.onCollect(type,item);else collect(type);});crate=new LuckyCrate(scene,world,data,session,audio,toast);
  const [g,m]=await Promise.all([loadAsset('models/grenade.glb').catch(()=>null),loadAsset('models/landmine.glb').catch(()=>null),enemies.load(),view.load(),audio.load(),powerups.load(),crate.load()]);grenadeModel=g;mineModel=m;
  enableShadows(renderer,pipeline.tier,{receivers:[world.static],lights:[flashlight]});
  api=new Backend((await fetch('data/mp.json').then(r=>r.json()).catch(()=>({}))).backend,query.get('api'));coopMenu();
  const coopRoom=(query.get('join')??query.get('host')??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
  if(coopRoom){progress('Opening the co-op room',95);await setupCoop(query.get('join')?'client':'host',coopRoom);}
  await equipView();player.update(.05,{});ready=true;
  progress('Ready',100);$('loading').hidden=true;$('start').disabled=contextLost;$('menu-status').textContent=touchControls.mode?'Tap to enter':pad.connected?'Press START to play':'Click to capture the mouse · Esc to pause';
}catch(error){console.error(error);errors.push(String(error));$('load-label').textContent='Unable to start: '+error.message;$('menu-status').textContent='See the browser console for details';}
renderer.info.autoReset=false;
function renderFrame(now){
  if(document.hidden||contextLost)return;
  const interval=profile.mobile?(active?1000/30:200):0;if(lastRendered&&now-lastRendered<interval-1)return;
  lastRendered=now;const dt=Math.min((now-previous)/1000,.06);previous=now;frameTime+=dt;frameCount++;renderedFrames++;
  if(frameTime>.75){fps=Math.round(frameCount/frameTime);frameTime=0;frameCount=0;}
  pad.poll();update(dt);renderer.info.reset();pipeline.render(dt,{view:ready&&started&&view.pivot.visible});
}
resumeRendering();
