// Zombies co-op (2-4 players) over the same peer-to-peer rooms as multiplayer.
// The host owns the undead, the round, doors, power, barricades and power-ups. Every player keeps their own points,
// weapons, perks and health; a joiner's hits are sent to the host, which answers with the score for them.
import * as THREE from 'three';
import { Net } from './net.js';
import { loadAsset, instance, ClipRig } from './models.js';

const MAX=4,KINDS=['zombie','dog','nova'],STATES=['chase','attack','barricade','entering'],REVIVE_SECONDS=3;
const AVATAR={url:'models/soldier.glb',clips:{idle:'Idle_Shoot',run:'Run_Gun',death:'Death'},show:['Body','Head','ShoulderPad.L','ShoulderPad.R','AK']};
const clean=n=>String(n??'').replace(/[^\w .\-]/g,'').slice(0,14)||'Guest',num=(v,lo,hi)=>Math.min(hi,Math.max(lo,+v||0)),r1=v=>Math.round(v*10)/10;

export async function createCoop(g){
  const {session,enemies,world,powerups,audio,data}=g,net=new Net(),mates=new Map(),asset=await loadAsset(AVATAR.url),gone=new Set();
  const c={role:g.role,room:g.room,seat:g.role==='host'?0:-1,over:false,status:'',mates};
  let sendT=0,lastSnap=0,lastRound=session.round;
  session.coop=true;

  // ---------- other players ----------
  function addMate(seat,name){
    const model=instance(asset,70,'y'),root=new THREE.Group();model.rotation.y=Math.PI/2;
    model.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=true;if(!AVATAR.show.some(n=>o.name.startsWith(n.replace('.',''))))o.visible=false;}});
    const rig=new ClipRig(model,asset.clips);for(const [k,v] of Object.entries(AVATAR.clips))rig.map(k,v);rig.play('idle');
    root.add(model);g.scene.add(root);
    const m={seat,name:clean(name),root,rig,pos:new THREE.Vector3(),netPos:null,yaw:0,state:2,ev:[],hold:0,held:-9,last:performance.now()};mates.set(seat,m);return m;
  }
  function dropMate(m){m.root.removeFromParent();m.rig.dispose();mates.delete(m.seat);}
  function moveMates(dt){
    for(const m of mates.values()){
      const before=m.pos.clone();if(m.netPos)m.pos.lerp(m.netPos,Math.min(1,dt*14));m.root.position.copy(m.pos);m.root.rotation.y=m.yaw+Math.PI/2;m.root.visible=m.state!==2;
      if(m.state===1)m.rig.play('death',false,1,.1);else m.rig.play(before.distanceTo(m.pos)/Math.max(dt,.001)>30?'run':'idle',true,1,.15);
      m.rig.update(dt);if(session.time-m.held>.3)m.hold=0;
    }
  }
  const myState=()=>!g.started()||session.phase==='gameover'||session.downState==='out'?2:session.downState==='down'?1:0;
  const everyone=()=>[{seat:c.seat,pos:g.player.getFeetPosition(),state:myState()},...mates.values()];

  // ---------- events ----------
  // Things that happen once (a score, a hit on a player, a power-up) travel in the next snapshot.
  function handle(e){
    if(e[0]==='pt')session.scoreHit(!!e[1],!!e[2],!!e[3]);
    if(e[0]==='dmg')g.hurt(num(e[1],0,500),new THREE.Vector3(+e[2]||0,g.player.getFeetPosition().y,+e[3]||0));
    if(e[0]==='pu'&&data.powerups[e[1]])g.collect(e[1]);
    if(e[0]==='rev'&&session.downState==='down'){session.revive();g.announce('Revived','BACK ON YOUR FEET',3);}
    if(e[0]==='shot'){const m=mates.get(e[1]),def=data.weapons[e[2]];if(m&&def)audio.at3(m.pos.clone().add(new THREE.Vector3(0,50,0)),()=>audio.shot(def),2600,.8);}
    if(e[0]==='boom'){const p=new THREE.Vector3(+e[1]||0,+e[2]||0,+e[3]||0);g.fx.boom(p,num(e[4],40,400));audio.at3(p,()=>audio.play('explosion',.9),3200);}
    if(e[0]==='say')g.toast(clean(e[1])+' '+(e[2]?'joined':'left'),3);
  }
  // Host: send an event to one seat, or to everyone but `skip` (the host handles its own copy at once).
  const to=(seat,e)=>{if(seat===0)handle(e);else mates.get(seat)?.ev.push(e);};
  const all=(e,skip=-1)=>{for(const m of mates.values())if(m.seat!==skip)m.ev.push(e);if(skip!==0)handle(e);};

  // ---------- host ----------
  function snapshot(m){
    const ev=m.ev;m.ev=[];
    return {t:'snap',you:m.seat,over:c.over,round:session.round,phase:['preparing','fighting'].includes(session.phase)?session.phase:'fighting',count:r1(session.countdown),total:session.total,spawned:session.spawned,killed:session.killed,dog:session.dogRound,dogs:session.dogRounds,
      power:session.power,doors:[...session.openDoors],boards:world.barriers.map(b=>b.count),
      z:enemies.list.map(z=>[z.id,KINDS.indexOf(z.kind),...z.root.position.toArray().map(r1),Math.round(z.root.rotation.y*100)/100,STATES.indexOf(z.state),Math.round(z.health)]),
      pl:everyone().filter(p=>p.seat!==m.seat).map(p=>[p.seat,p.seat===0?clean(g.name):p.name,...p.pos.toArray().map(r1),p.seat===0?Math.round(g.camera.rotation.y*100)/100:p.yaw,p.state]),
      pu:powerups.items.map(p=>[p.id,p.type,...p.root.position.toArray().map(r1),r1(p.age)]),ev};
  }
  function hostData(conn,m){
    let mate=net.conns.get(conn);
    if(m?.t==='hello'&&!mate){
      const seat=[1,2,3].find(s=>!mates.has(s));if(seat===undefined||mates.size>=MAX-1||c.over){conn.send({t:'full'});return;}
      mate=addMate(seat,m.name);mate.conn=conn;net.conns.set(conn,mate);all(['say',mate.name,1],seat);conn.send(snapshot(mate));return;
    }
    if(!mate||!m)return;mate.last=performance.now();
    if(m.t==='pos'){mate.netPos=(mate.netPos??new THREE.Vector3()).fromArray((m.p??[]).slice(0,3).map(v=>+v||0));mate.yaw=+m.y||0;mate.state=m.st===0?0:m.st===1?1:2;}
    if(m.t==='hurt'){const z=enemies.list.find(z=>z.id===m.id);if(!z||mate.state!==0)return;enemies.scorer=(k,h,ml)=>mate.ev.push(['pt',k?1:0,h?1:0,ml?1:0]);try{enemies.hurt(z,num(m.d,0,200000),!!m.h,!!m.m,['bullet','explosion','static'].includes(m.c)?m.c:'bullet');}finally{enemies.scorer=null;}}
    if(m.t==='door'&&world.doors.has(m.v)&&!session.openDoors.has(m.v)){session.openDoors.add(m.v);session.flags.add(world.doors.get(m.v).flag);world.setDoors(session);audio.play('door');}
    if(m.t==='power'&&!session.power)g.powerOn();
    if(m.t==='board'){const b=world.barriers.find(b=>b.id===m.id);if(b&&mate.state===0)world.setBoards(b,Math.max(b.count,Math.min(b.count+1,m.n|0)));}
    if(m.t==='grab'){const p=powerups.items.find(p=>p.id===m.id);if(p&&mate.state===0){powerups.burst(p.root.position.clone());powerups.remove(p);all(['pu',p.type]);}}
    if(m.t==='revive')revive(m.seat|0);
    if(m.t==='shot'&&data.weapons[m.w])all(['shot',mate.seat,m.w],mate.seat);
    if(m.t==='boom')all(['boom',...(m.p??[]).slice(0,3).map(v=>+v||0),num(m.r,40,400)],mate.seat);
    if(m.t==='bye')leave(conn);
  }
  function leave(conn){const m=net.conns.get(conn);if(!m)return;net.conns.delete(conn);dropMate(m);all(['say',m.name,0]);try{conn.close();}catch{}}
  function revive(seat){const p=everyone().find(p=>p.seat===seat);if(p?.state===1)to(seat,['rev']);}
  // Each zombie goes for the nearest player who is still standing.
  function pick(z,fallback){let best=null,d=Infinity;for(const p of everyone()){if(p.state!==0)continue;const n=p.pos.distanceToSquared(z.root.position);if(n<d){d=n;best=p;}}return best?{pos:best.pos,id:best.seat}:{pos:fallback,id:-1,none:true};}

  // ---------- joiner ----------
  function clientData(conn,m){
    if(m?.t==='full'){c.status='That game is full';net.onLost=null;return;}
    if(m?.t!=='snap')return;lastSnap=performance.now();c.seat=m.you|0;
    const ids=new Set();
    for(const a of (m.z??[]).slice(0,40)){
      const id=a[0]|0,pos=new THREE.Vector3(+a[2]||0,+a[3]||0,+a[4]||0);ids.add(id);let z=enemies.list.find(z=>z.hid===id);
      if(!z){z=enemies.spawn(pos,null,KINDS[a[1]]??'zombie');z.hid=id;z.maxHealth=+a[7]||z.maxHealth;}
      const state=STATES[a[6]]??'chase';
      if(state!==z.state){if(state==='attack')z.rig.play('attack',false,Math.max(.8,z.rig.duration('attack')/1.1));else if(state==='barricade')z.rig.play('attack',true,1.2);else z.rig.play('walk',true,z.pace);z.state=state;}
      z.netPos=pos;z.netYaw=+a[5]||0;z.health=Math.min(z.health,+a[7]||0)||+a[7]||0;
    }
    for(const z of [...enemies.list])if(!ids.has(z.hid))enemies.puppetKill(z);
    const seats=new Set();
    for(const a of (m.pl??[]).slice(0,MAX)){const seat=a[0]|0;seats.add(seat);const p=mates.get(seat)??addMate(seat,a[1]);p.name=clean(a[1]);p.netPos=(p.netPos??new THREE.Vector3()).set(+a[2]||0,+a[3]||0,+a[4]||0);if(p.state===2&&a[6]!==2)p.pos.copy(p.netPos);p.yaw=+a[5]||0;p.state=a[6]===0?0:a[6]===1?1:2;}
    for(const p of [...mates.values()])if(!seats.has(p.seat))dropMate(p);
    const live=new Set();
    for(const a of (m.pu??[]).slice(0,12)){const id=a[0]|0;live.add(id);if(gone.has(id)||powerups.items.some(p=>p.id===id)||!data.powerups[a[1]])continue;const p=powerups.spawn(a[1],new THREE.Vector3(+a[2]||0,(+a[3]||0)-40,+a[4]||0));if(p){p.id=id;p.age=+a[5]||0;}}
    for(const p of [...powerups.items])if(!live.has(p.id))powerups.remove(p);
    // Shared round state. A new round also brings back anyone who bled out.
    const round=Math.min(999,m.round|0);
    if(round>session.round){while(session.round<round)session.nextRound();if(session.downState)g.respawn();}
    if(!['gameover','reviving'].includes(session.phase))session.phase=m.phase==='preparing'?'preparing':'fighting';
    Object.assign(session,{countdown:+m.count||0,total:m.total|0,spawned:m.spawned|0,killed:m.killed|0,dogRound:!!m.dog,dogRounds:m.dogs|0});
    if(m.power&&!session.power)g.powerOn();
    for(const d of m.doors??[])if(world.doors.has(d)&&!session.openDoors.has(d)){session.openDoors.add(d);session.flags.add(world.doors.get(d).flag);world.setDoors(session);audio.play('door');}
    (m.boards??[]).forEach((n,i)=>{const b=world.barriers[i];if(b&&b.count!==(n|0))world.setBoards(b,n|0);});
    for(const e of (m.ev??[]).slice(0,60))if(Array.isArray(e))handle(e);
    if(m.over&&!c.over){c.over=true;g.gameOver();}
  }

  // ---------- shared actions (called by the game) ----------
  Object.assign(c,{
    live:()=>g.started()&&session.phase!=='gameover',
    hurtRemote(seat,n,at){if(c.role!=='host'||!(seat>0))return seat===-1;to(seat,['dmg',Math.round(n),r1(at.x),r1(at.z)]);return true;},
    onCollect(type,item){if(c.role==='host')all(['pu',type]);else{gone.add(item.id);net.send({t:'grab',id:item.id});}},
    door(id){if(c.role==='client')net.send({t:'door',v:id});},
    power(){if(c.role==='client')net.send({t:'power'});},
    board(b){if(c.role==='client')net.send({t:'board',id:b.id,n:b.count});},
    shot(w){if(c.role==='client')net.send({t:'shot',w});else all(['shot',0,w],0);},
    boom(p,r){const e=['boom',...p.toArray().map(r1),Math.round(r)];if(c.role==='client')net.send({t:'boom',p:e.slice(1,4),r});else all(e,0);},
    // A downed teammate close enough to help.
    reviveTarget(from){if(myState()!==0)return null;let best=null;for(const m of mates.values())if(m.state===1&&m.pos.distanceTo(from)<110&&(!best||m.pos.distanceTo(from)<best.pos.distanceTo(from)))best=m;return best;},
    reviveText:m=>m.hold>0?`Reviving ${m.name}… ${Math.round(100*m.hold/REVIVE_SECONDS)}%`:`Hold F to revive ${m.name}`,
    holdRevive(m,dt){m.hold+=dt;m.held=session.time;if(m.hold<REVIVE_SECONDS)return;m.hold=0;if(c.role==='host')revive(m.seat);else net.send({t:'revive',seat:m.seat});m.state=0;session.addPoints(100);g.toast('Revived '+m.name);},
    hud:()=>[...mates.values()].map(m=>`<span class="${['','down','out'][m.state]}">${m.name}${m.state===1?' · DOWN':m.state===2?' · OUT':''}</span>`).join(''),
    state:()=>({role:c.role,room:c.room,seat:c.seat,over:c.over,status:c.status,net:net.status,mates:[...mates.values()].map(m=>({seat:m.seat,name:m.name,state:m.state,pos:m.pos.toArray()}))}),
    update(dt){
      moveMates(dt);const now=performance.now();
      if(c.role==='host'){
        session.players=everyone().filter(p=>p.state!==2).length||1;
        if(session.round!==lastRound){lastRound=session.round;if(session.downState)g.respawn();}
        if(g.started()&&!c.over&&everyone().every(p=>p.state!==0)&&!['reviving'].includes(session.phase)){c.over=true;g.gameOver();}
        if(now-sendT>80){sendT=now;for(const [conn,m] of [...net.conns]){if(!m)continue;if(now-m.last>8000){leave(conn);continue;}if(conn.open)conn.send(snapshot(m));}}
      }else if(now-sendT>50&&net.conn?.open){sendT=now;net.send({t:'pos',p:g.player.getFeetPosition().toArray().map(r1),y:Math.round(g.camera.rotation.y*100)/100,st:myState()});}
    },
    leave(){if(c.role==='client')net.send({t:'bye'});},
  });

  net.onStatus=t=>{c.status=t;g.status?.(t);};
  if(c.role==='host'){
    net.onData=hostData;net.onClose=leave;enemies.pick=pick;enemies.spawnNear=()=>{const up=everyone().filter(p=>p.state===0);return up.length?up[Math.floor(Math.random()*up.length)].pos:null;};
    await net.host('z-'+c.room);
  }else{
    enemies.autoSpawn=false;enemies.autoRounds=false;enemies.remoteHurt=(z,d,h,ml,cause)=>net.send({t:'hurt',id:z.hid,d:Math.round(d),h:!!h,m:!!ml,c:cause});
    net.onData=clientData;net.onLost=()=>{if(c.over)return;c.over=true;c.status='The host left the game';g.toast('The host left the game',6);g.gameOver();};
    for(let n=0;;n++){try{await net.join('z-'+c.room);break;}catch(e){if(n>=4)throw e;await new Promise(r=>setTimeout(r,3000));}}
    net.send({t:'hello',name:clean(g.name)});
    // A closed host tab is not always reported by the data channel.
    setInterval(()=>{if(lastSnap&&!c.over&&performance.now()-lastSnap>9000)net.onLost?.();},1000);
  }
  return c;
}
