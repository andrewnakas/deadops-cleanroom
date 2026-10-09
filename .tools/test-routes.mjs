import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController } from '../export/web/player-controller.js';
import { deserializeCollisionWorld } from '../export/web/collision-world.js';
import { init, importNavMesh, NavMeshQuery } from '@recast-navigation/core';
fs.mkdirSync('artifacts',{recursive:true});
const meta=JSON.parse(fs.readFileSync('export/web/maps/cinema-collision.json')),bytes=fs.readFileSync('export/web/maps/cinema-collision.bin');
const physics=deserializeCollisionWorld(meta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
await init();const {navMesh}=importNavMesh(new Uint8Array(fs.readFileSync('export/web/maps/cinema-nav.bin')));
const query=new NavMeshQuery(navMesh,{maxNodes:16384});query.defaultQueryHalfExtents={x:70,y:100,z:70};
const camera=new THREE.PerspectiveCamera();camera.rotation.order='YXZ';
const player=new PlayerController(camera,physics,{spawn:new THREE.Vector3(0,0,470),radius:14,height:70,eyeHeight:60,moveSpeed:190,gravity:800,jumpHeight:39,fallResetY:-300,maxSubSteps:12,groundSnapSpeed:10});
const results=[];
for(const [name,start,end]of [['lobby to stage',[0,0,470],[0,40,-1250]],['lobby up the stair hall to the balcony',[0,0,470],[300,160,-150]],['balcony to projection booth',[300,160,-150],[0,160,140]],['balcony stairs down to the seats',[-540,160,-200],[-540,0,-800]],['stage to dressing rooms',[-300,40,-1250],[-800,40,-1200]],['auditorium to back alley',[500,0,-850],[900,0,-900]]]){
 player.setPosition(new THREE.Vector3(...start));for(let i=0;i<90;i++)player.update(1/60,{});
 const path=query.computePath(player.getFeetPosition(),new THREE.Vector3(...end)).path;
 let failure=null,steps=0;
 for(const waypoint of path.slice(1)){
  let reached=false;
  for(let i=0;i<600;i++){
   const feet=player.getFeetPosition();if(Math.hypot(feet.x-waypoint.x,feet.z-waypoint.z)<12){reached=true;break;}
   camera.lookAt(waypoint.x,camera.position.y,waypoint.z);player.update(1/60,{forward:1});steps++;
  }
  if(!reached){failure={waypoint,feet:player.getFeetPosition().toArray(),state:player.state};break;}
 }
 const result={name,passed:!failure,steps,failure,feet:player.getFeetPosition().toArray()};results.push(result);console.log(JSON.stringify(result));
}
fs.writeFileSync('artifacts/physical-routes.json',JSON.stringify(results,null,2));
assert(results.every(r=>r.passed),'Physical routes must be walkable without teleporting between waypoints');
