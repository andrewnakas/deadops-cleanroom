import * as THREE from 'three';
import { init, importNavMesh, NavMeshQuery } from '@recast-navigation/core';
import { CollisionWorld } from './collision-world.js';
import { buildGeometry, collisionSoup, boxGeometry } from './map-kit.js';
import { perkMachine, luckyCrate, refineryMachine, powerSwitch, wallChalk, planks, poster, filmScreen, canvasTexture } from './props.js';
import { loadAsset, instance } from './models.js';

export const vector=a=>new THREE.Vector3().fromArray(a);
export const zoneNames={lobby:'Lobby',stairs:'Stair hall',balcony:'Balcony',booth:'Projection booth',auditorium:'Auditorium',dressing:'Dressing rooms',alley:'Back alley'};
// Surface materials: ambientCG CC0 textures (assets/LICENSES.csv) with a tint per use.
const SURFACES={tiles:{tint:0x9a9284,scale:48},plaster:{tint:0x9a948a,scale:120},wallpaper:{tint:0x8f6f5a,scale:90},paintedwood:{tint:0x7a5a3c,scale:80},
  metal:{tint:0x8a8f96,scale:80,metal:.6},velvet:{tint:0x9a1d22,scale:60},carpet:{tint:0x7a3430,scale:110},bricks:{tint:0x9a7a6a,scale:120},
  woodfloor:{tint:0xa08060,scale:110},concrete:{tint:0x8a8a86,scale:140},asphalt:{tint:0x6a6a6a,scale:160},planks:{tint:0xa88a62,scale:60},
  grass:{tint:0x7a9a5a,scale:120},hedge:{tint:0x3f6a34,scale:80},roof:{tint:0x7a4a3a,scale:90},siding:{tint:0xc8c0a8,scale:100},siding_b:{tex:'siding',tint:0x8aa0b8,scale:100},
  glass:{plain:0x9fc8d8,opacity:.35},water:{plain:0x3a8ab8,opacity:.8},carpaint:{plain:0x8a2a24,metal:.5},carpaint_b:{plain:0x2a4a7a,metal:.5}};
function boxCollider(min,max){return new CollisionWorld(boxGeometry(min,max));}
function yawToward(normal){return Math.atan2(normal[0],normal[2]);}

export class World {
  constructor(scene,data,map){this.scene=scene;this.data=data;this.map=map;this.doors=new Map();this.barriers=[];this.dynamic=[];this.interactions=[];this.navDisabled=new Set();this.animated=[];this.crates=[];this.machines=new Map();}
  async load(progress,{mapName='cinema'}={}){
    const kit=this.map.kit;
    progress('Building the picture house',15);
    const loader=new THREE.TextureLoader(),tex=(url,color=false)=>loader.loadAsync(url).then(t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(color)t.colorSpace=THREE.SRGBColorSpace;return t;}).catch(()=>null);
    this.materials={};
    const used=new Set(kit.solids.map(x=>x.mat));
    await Promise.all(Object.entries(SURFACES).filter(([name])=>used.has(name)).map(async([name,s])=>{
      if(s.plain!==undefined){this.materials[name]=new THREE.MeshStandardMaterial({color:s.plain,roughness:.35,metalness:s.metal??0,transparent:!!s.opacity,opacity:s.opacity??1,depthWrite:!s.opacity});return;}
      const t=s.tex??name,[map,normalMap,roughnessMap]=await Promise.all([tex(`textures/${t}_color.jpg`,true),tex(`textures/${t}_normal.jpg`),tex(`textures/${t}_rough.jpg`)]);
      this.materials[name]=new THREE.MeshStandardMaterial({color:s.tint,map,normalMap,roughnessMap,roughness:1,metalness:s.metal??0,normalScale:new THREE.Vector2(.8,.8)});
    }));
    const geos=buildGeometry(kit.solids,{scales:Object.fromEntries(Object.entries(SURFACES).map(([k,s])=>[k,s.scale]))});
    this.static=new THREE.Group();this.static.name='map';
    for(const [mat,geo] of geos){const m=new THREE.Mesh(geo,this.materials[mat]??this.materials.plaster);m.name='map_'+mat;m.matrixAutoUpdate=false;this.static.add(m);}
    this.scene.add(this.static);
    const soup=collisionSoup(kit.solids);const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(soup.positions,3));cg.setIndex(new THREE.BufferAttribute(soup.indices,1));
    this.collision=new CollisionWorld(cg,{format:'runtime-bvh',byteLength:soup.positions.byteLength+soup.indices.byteLength});
    progress('Tracing the aisles',35);
    const bytes=await fetch(`maps/${mapName}-nav.bin`).then(r=>{if(!r.ok)throw new Error('navmesh HTTP '+r.status);return r.arrayBuffer();});
    await init();
    const nav=importNavMesh(new Uint8Array(bytes));this.nav=nav.navMesh;this.query=new NavMeshQuery(this.nav,{maxNodes:8192});this.query.defaultQueryHalfExtents={x:70,y:100,z:70};
    for(const l of kit.lights){const p=new THREE.PointLight(l.color,l.intensity*900,l.distance*1.6,1.6);p.position.fromArray(l.position);this.scene.add(p);}
    progress('Boarding up the windows',50);
    const ents=kit.entities;
    for(const e of ents.filter(e=>e.type==='door')){
      const min=vector(e.min),max=vector(e.max),size=max.clone().sub(min),center=min.clone().add(max).multiplyScalar(.5);
      const obj=new THREE.Group();obj.position.copy(center);
      const thin=size.x<size.z?'x':'z',w=thin==='x'?size.z:size.x;
      const panel=new THREE.Mesh(new THREE.BoxGeometry(thin==='x'?size.x*.6:w,size.y,thin==='x'?w:size.z*.6),this.materials.paintedwood);obj.add(panel);
      const p=planks(w,size.y*.9,this.materials);p.group.position.set(0,-size.y/2,0);if(thin==='x')p.group.rotation.y=Math.PI/2;
      for(const s of [-1,1]){const g=p.group.clone();g.position.add(new THREE.Vector3(thin==='x'?s*size.x*.5:0,0,thin==='z'?s*size.z*.5:0));obj.add(g);}
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(36,12),new THREE.MeshBasicMaterial({map:canvasTexture(192,64,(g,W,H)=>{g.fillStyle='#14100c';g.fillRect(0,0,W,H);g.fillStyle='#f0d690';g.font='bold 30px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(String(e.cost),W/2,H/2);}),side:THREE.DoubleSide}));
      sign.position.y=size.y/2-14;if(thin==='x')sign.rotation.y=Math.PI/2;obj.add(sign);
      this.scene.add(obj);
      const part={collider:boxCollider(e.min,e.max),box:new THREE.Box3(min,max),enabled:true,object:obj};this.dynamic.push(part);
      this.doors.set(e.name,{name:e.name,cost:e.cost,flag:e.flag,parts:[part],triggers:e.triggers});
      for(const t of e.triggers)this.interactions.push({kind:'door',door:e.name,position:vector(t)});
    }
    for(const e of ents.filter(e=>e.type==='barrier')){
      const c=vector(e.center),n=vector(e.normal),sill=e.sill,top=e.top,yaw=yawToward(e.normal);
      const grp=new THREE.Group();grp.position.copy(c).setY(c.y+sill);grp.rotation.y=yaw;
      const p=planks(e.width,top-sill,this.materials);p.group.position.z=n.length()?8:0;grp.add(p.group);this.scene.add(grp);
      const along=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)).multiplyScalar(e.width/2),half=new THREE.Vector3(Math.abs(along.x)+Math.abs(n.x)*8,(top-sill)/2,Math.abs(along.z)+Math.abs(n.z)*8);
      const mid=c.clone().setY(c.y+(sill+top)/2);
      const clip={collider:boxCollider(mid.clone().sub(half).toArray(),mid.clone().add(half).toArray()),box:new THREE.Box3(mid.clone().sub(half),mid.clone().add(half)),enabled:true,window:true};this.dynamic.push(clip);
      const outside=c.clone().addScaledVector(n,70),inside=c.clone().addScaledVector(n,-56);const near=this.closest(inside);if(near)inside.copy(near);
      this.barriers.push({id:e.id,zone:e.zone,position:c.clone().setY(c.y+sill),outside,inside,normal:n,boards:p.boards,count:p.boards.length,repairTime:0,rewardRound:0,reward:0});
    }
    progress('Wiring the machines',65);
    const place=(obj,e)=>{obj.position.fromArray(e.position);obj.rotation.y=e.yaw??0;this.scene.add(obj);return obj;};
    const front=(e,d=34)=>vector(e.position).add(new THREE.Vector3(Math.sin(e.yaw??0)*d,0,Math.cos(e.yaw??0)*d));
    for(const e of ents.filter(e=>e.type==='perk')){const def=this.data.perks[e.perk],m=place(perkMachine(def),e);this.machines.set(e.perk,m);this.interactions.push({kind:'perk',perk:e.perk,position:front(e,30).setY(e.position[1]+40)});}
    for(const e of ents.filter(e=>e.type==='refinery')){this.refinery=place(refineryMachine(),e);this.interactions.push({kind:'refinery',position:front(e,36).setY(e.position[1]+40)});}
    for(const e of ents.filter(e=>e.type==='power')){this.power=place(powerSwitch(),e);this.interactions.push({kind:'power',position:front(e,20).setY(e.position[1]+50)});}
    for(const e of ents.filter(e=>e.type==='crate')){
      const crate=place(luckyCrate(),e),rubble=place(planks(50,14,this.materials).group,{...e,position:[e.position[0],e.position[1]+2,e.position[2]]});rubble.rotation.x=-Math.PI/2+.1;
      const c={id:e.id,start:!!e.start,object:crate,lid:crate.userData.lid,rubble,position:vector(e.position),yaw:e.yaw??0};this.crates.push(c);
      this.interactions.push({kind:'crate',crate:c,position:front(e,24).setY(e.position[1]+30)});
    }
    const gunModels={};
    for(const e of ents.filter(e=>e.type==='wallbuy'||e.type==='axe')){
      const isAxe=e.type==='axe',def=isAxe?this.data.axe:e.equipment?this.data.equipment[e.weapon]:this.data.weapons[e.weapon];
      const holder=place(new THREE.Group(),e);holder.add(wallChalk(def.name,def.price));
      const url=isAxe?'models/axe.glb':e.equipment?def.model:def.view.model;
      try{gunModels[url]??=await loadAsset(url);const m=instance(gunModels[url],isAxe?28:e.equipment?12:Math.max(16,def.view.length*60),'max');
        const b=m.userData.bounds;m.userData.inner.position.sub(b.min.clone().add(b.max).multiplyScalar(.5));m.position.set(0,64,3);if(!isAxe&&!e.equipment)m.rotation.y=0;holder.add(m);}catch(err){console.warn(err);}
      this.interactions.push({kind:isAxe?'axe':e.equipment?'equipment':'wallbuy',weapon:e.weapon,position:front(e,24).setY(e.position[1]+50)});
    }
    for(const e of ents.filter(e=>e.type==='poster')){const p=poster(e.index);p.position.fromArray(e.position);p.rotation.y=e.yaw;p.translateZ(.7);this.scene.add(p);}
    for(const e of ents.filter(e=>e.type==='screen')){const min=vector(e.min),max=vector(e.max),s=filmScreen(max.x-min.x,max.y-min.y);s.position.set((min.x+max.x)/2,(min.y+max.y)/2,max.z+.5);this.scene.add(s);this.animated.push(s);this.screen=s;}
    this.zones=ents.filter(e=>e.type==='zone').map(z=>({name:z.name,boxes:z.boxes.map(([a,b])=>new THREE.Box3(vector(a),vector(b)))}));
    this.spawn=ents.find(e=>e.type==='spawn');
    this.activeBox=this.crates.find(c=>c.start)??this.crates[0];
    this.spawns=ents.filter(e=>e.type==='spawn');this.waypoints=ents.filter(e=>e.type==='waypoint');
    this.boxBeam=new THREE.Mesh(new THREE.CylinderGeometry(6,22,900,12,1,true),new THREE.MeshBasicMaterial({color:0x9fd4ff,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.scene.add(this.boxBeam);this.openBoxes=new Set();this.updateBox();
    this.physics={capsuleIntersect:c=>{
      const hit=this.collision.capsuleIntersect(c);if(hit)return hit;
      for(const d of this.dynamic)if(d.enabled&&d.collider){const h=d.collider.capsuleIntersect(c);if(h)return h;}
      for(const z of this.actors?.()??[]){
        if(z.state==='barricade'||z.state==='entering')continue;
        const p=z.root.position,feet=c.start.y-c.radius,top=c.end.y+c.radius;
        if(feet>p.y+(z.kind==='zombie'?65:32)||top<p.y+4)continue;
        const normal=new THREE.Vector3(c.start.x-p.x,0,c.start.z-p.z),distance=normal.length(),depth=c.radius+15-distance;
        if(depth>0)return {normal:distance>.001?normal.divideScalar(distance):new THREE.Vector3(1,0,0),depth};
      }
      return false;
    },rayIntersect:(r,n=0,f=Infinity)=>this.raycast(r,n,f,true)};
  }
  update(dt,session){
    for(const a of this.animated)a.userData.update?.(dt,session.power);
    if(this.refinery){const busy=!!session.refinery;for(const r of this.refinery.userData.rollers)r.rotation.y+=dt*(busy?9:session.power?.6:0);this.refinery.userData.light.intensity=session.power?(busy?2600:1200):0;}
    for(const [id,m] of this.machines)m.userData.light.intensity=(session.power||!this.data.perks[id].needsPower)?900+Math.sin(session.time*3+id.length)*120:0;
    if(this.power)this.power.userData.lever.rotation.x=THREE.MathUtils.damp(this.power.userData.lever.rotation.x,session.power?-.7:.7,6,dt);
    this.boxBeam.material.opacity=.07+Math.sin(session.time*2)*.02;
  }
  updateBox(){
    if(!this.activeBox){this.boxBeam.visible=false;return;}
    const p=this.activeBox.position;this.boxBeam.position.set(p.x,p.y+450,p.z);
    for(const c of this.crates){const visible=!!this.clearanceSale||c===this.activeBox||this.openBoxes?.has(c.id);c.object.visible=visible;c.rubble.visible=!visible;}
  }
  closest(p,extents){const r=this.query.findClosestPoint({x:p.x,y:p.y,z:p.z},extents?{halfExtents:extents}:undefined);return r.success?new THREE.Vector3(r.point.x,r.point.y,r.point.z):null;}
  path(a,b){const r=this.query.computePath({x:a.x,y:a.y,z:a.z},{x:b.x,y:b.y,z:b.z});return r.success?r.path.map(p=>new THREE.Vector3(p.x,p.y,p.z)):[];}
  raycast(ray,near=0,far=Infinity,windows=false){let hit=this.collision.rayIntersect(ray,near,far);for(const d of this.dynamic){if(!d.enabled||!d.collider||(!windows&&d.window))continue;const h=d.collider.rayIntersect(ray,near,hit?Math.min(hit.distance,far):far);if(h)hit=h;}return hit;}
  lineClear(a,b){const v=b.clone().sub(a),dist=v.length();return !this.raycast(new THREE.Ray(a,v.normalize()),1,Math.max(1,dist-4));}
  setDoors(session){
    for(const [name,d] of this.doors){const open=session.openDoors.has(name);for(const p of d.parts){p.enabled=!open;if(p.object)p.object.visible=!open;}}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,1);this.navDisabled.clear();
    for(const d of this.dynamic){if(!d.enabled||d.window)continue;const c=d.box.getCenter(new THREE.Vector3()),h=d.box.getSize(new THREE.Vector3()).multiplyScalar(.5);h.x+=5;h.z+=5;const r=this.query.queryPolygons(c,h);for(const ref of r.polyRefs??[])this.navDisabled.add(ref);}
    for(const ref of this.navDisabled)this.nav.setPolyFlags(ref,0);
  }
  activeZones(session){const active=new Set(this.map.start);let changed=true;while(changed){changed=false;for(const [a,b,f]of this.map.links)if(session.flags.has(f)&&(active.has(a)||active.has(b))){if(!active.has(a)||!active.has(b))changed=true;active.add(a);active.add(b);}}return active;}
  zoneAt(p){return this.zones.find(z=>z.boxes.some(b=>b.containsPoint(p)))?.name;}
  spawnBarriers(session){const zones=this.activeZones(session);return this.barriers.filter(b=>zones.has(b.zone));}
  setBoards(barrier,count){barrier.count=Math.max(0,Math.min(barrier.boards.length,count));barrier.boards.forEach((o,i)=>o.visible=i<barrier.count);}
  reset(session){for(const b of this.barriers){this.setBoards(b,b.boards.length);b.reward=0;b.rewardRound=0;}this.activeBox=this.crates.find(c=>c.start)??this.crates[0];this.openBoxes.clear();this.clearanceSale=false;this.updateBox();this.setDoors(session);}
}
