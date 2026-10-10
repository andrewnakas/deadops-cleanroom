import * as THREE from 'three';

// Pooled world effects shared by every mode: particles, tracers, bullet holes, blood,
// shell casings, muzzle flashes and explosions. Nothing here allocates per shot.
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(),_c=new THREE.Color(),_v=new THREE.Vector3(),_z=new THREE.Vector3(0,0,1),_up=new THREE.Vector3(0,1,0);
function dotTexture(draw){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');draw(g);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const softDot=()=>dotTexture(g=>{const r=g.createRadialGradient(32,32,2,32,32,30);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.5,'rgba(255,255,255,.75)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);});
const splat=()=>dotTexture(g=>{g.fillStyle='#fff';for(let i=0;i<9;i++){const a=i*2.3,r=i?8+((i*37)%13):0;g.beginPath();g.arc(32+Math.cos(a)*r,32+Math.sin(a)*r,i?4+((i*53)%7):15,0,7);g.fill();}});
const star=()=>dotTexture(g=>{g.translate(32,32);const r=g.createRadialGradient(0,0,1,0,0,30);r.addColorStop(0,'rgba(255,250,220,1)');r.addColorStop(.35,'rgba(255,190,90,.8)');r.addColorStop(1,'rgba(255,120,30,0)');g.fillStyle=r;
  for(let i=0;i<5;i++){g.rotate(Math.PI*2/5);g.beginPath();g.moveTo(-5,0);g.lineTo(0,-30);g.lineTo(5,0);g.fill();}g.beginPath();g.arc(0,0,11,0,7);g.fill();});
export function flashTexture(){return star();}
export class Fx {
  constructor(scene,{particles=640,decals=160,raycast=null,low=false}={}){
    this.scene=scene;this.raycast=raycast;this.low=low;this.time=0;
    this.max=low?Math.round(particles/2):particles;this.parts=[];
    this.cubes=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({toneMapped:false}),this.max);
    this.cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.cubes.setColorAt(0,_c.set(0xffffff));this.cubes.count=0;this.cubes.frustumCulled=false;this.cubes.name='fx_particles';scene.add(this.cubes);
    this.maxDecals=low?Math.round(decals/2):decals;this.decals=[];this.decalNext=0;
    const decalMesh=tex=>{const m=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,toneMapped:false}),this.maxDecals);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.setColorAt(0,_c.set(0));m.count=0;m.frustumCulled=false;scene.add(m);return m;};
    this.holes=decalMesh(softDot());this.holes.name='fx_holes';this.stains=decalMesh(splat());this.stains.name='fx_stains';this.holeList=[];this.stainList=[];
    this.tracers=[];for(let i=0;i<28;i++){const t=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));t.visible=false;t.frustumCulled=false;scene.add(t);this.tracers.push({mesh:t,life:0,max:1});}
    this.tracerNext=0;
    const flashMap=star();this.flashes=[];for(let i=0;i<10;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:flashMap,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));s.visible=false;scene.add(s);this.flashes.push({mesh:s,life:0});}
    this.flashNext=0;
    this.balls=[];for(let i=0;i<8;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),new THREE.MeshBasicMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));b.visible=false;scene.add(b);this.balls.push({mesh:b,life:0,max:1,radius:1});}
    this.ballNext=0;
    const smokeMap=softDot();this.smokes=[];for(let i=0;i<(low?10:28);i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeMap,transparent:true,depthWrite:false,color:0x555555}));s.visible=false;scene.add(s);this.smokes.push({mesh:s,life:0,max:1,v:new THREE.Vector3(),size:1,grow:0,alpha:.5});}
    this.smokeNext=0;
    this.lights=[];for(let i=0;i<(low?1:3);i++){const l=new THREE.PointLight(0xffb060,0,700,1.6);scene.add(l);this.lights.push({light:l,life:0,max:1,peak:0});}
    this.lightNext=0;
  }
  // Cube particles. `floor` makes them land and bounce (shell casings, gibs).
  burst(p,color=0x7a1a14,count=7,size=1.5,speed=100,{gravity=320,life=.45,up=.9,dir=null,cone=1,floor=null,drag=0}={}){
    if(this.low)count=Math.ceil(count*.6);
    for(let i=0;i<count;i++){
      if(this.parts.length>=this.max)this.parts.shift();
      const v=new THREE.Vector3((Math.random()-.5)*speed*cone,Math.random()*speed*up,(Math.random()-.5)*speed*cone);if(dir)v.addScaledVector(dir,speed*(.5+Math.random()*.6));
      this.parts.push({p:p.clone(),v,life:life*(.7+Math.random()*.6),size:size*(.7+Math.random()*.6),color,gravity,floor,drag,spin:Math.random()*6});
    }
  }
  shell(p,right,color=0xc8a040,floor=null){this.burst(p,color,1,.9,0,{gravity:600,life:1.4,floor,dir:null});const s=this.parts.at(-1);s.v.copy(right).multiplyScalar(60+Math.random()*40).add(new THREE.Vector3(0,90+Math.random()*40,0));s.shell=true;}
  tracer(a,b,color=0xffe0a0,life=.07,width=.7){
    const t=this.tracers[this.tracerNext=(this.tracerNext+1)%this.tracers.length],len=a.distanceTo(b);if(len<1)return;
    t.mesh.position.copy(a).add(b).multiplyScalar(.5);t.mesh.lookAt(b);t.mesh.scale.set(width,width,len);t.mesh.material.color.set(color);t.mesh.material.opacity=.8;t.mesh.visible=true;t.life=t.max=life;
  }
  flash(p,size=26,color=0xffd9a0){const f=this.flashes[this.flashNext=(this.flashNext+1)%this.flashes.length];f.mesh.position.copy(p);f.mesh.scale.setScalar(size*(.8+Math.random()*.5));f.mesh.material.rotation=Math.random()*6.3;f.mesh.material.color.set(color);f.mesh.visible=true;f.life=.05;}
  light(p,color=0xffb060,peak=6000,life=.25,distance=700){const l=this.lights[this.lightNext=(this.lightNext+1)%this.lights.length];if(!l)return;l.light.position.copy(p);l.light.color.set(color);l.light.distance=distance;l.life=l.max=life;l.peak=peak;}
  smoke(p,size=40,{life=1.4,color=0x555555,rise=30,grow=60,alpha=.45,spread=20}={}){
    const s=this.smokes[this.smokeNext=(this.smokeNext+1)%this.smokes.length];if(!s)return;
    s.mesh.position.copy(p);s.mesh.material.color.set(color);s.mesh.material.rotation=Math.random()*6.3;s.mesh.visible=true;s.life=s.max=life;s.size=size;s.grow=grow;s.alpha=alpha;s.v.set((Math.random()-.5)*spread,rise*(.6+Math.random()*.8),(Math.random()-.5)*spread);
  }
  _decal(list,mesh,p,n,size,color,life){
    const q=new THREE.Quaternion().setFromUnitVectors(_z,n).multiply(_q.setFromAxisAngle(_z,Math.random()*6.3));
    const d={p:p.clone().addScaledVector(n,.4),q,size,color,life,max:life};
    if(list.length>=this.maxDecals)list.shift();list.push(d);this._dirty=true;
  }
  hole(p,n,size=5,color=0x0c0b0a){this._decal(this.holeList,this.holes,p,n,size,color,this.low?12:30);}
  stain(p,n,size=22,color=0x4a0a08){this._decal(this.stainList,this.stains,p,n,size,color,this.low?10:26);}
  // Bullet strike on the world: hole, dust, a spark now and then. `hit` is a collision ray hit.
  impact(hit,dir,{color=0xb8a388,sparks=false}={}){
    const n=new THREE.Vector3();if(hit.triangle?.getNormal)hit.triangle.getNormal(n);else n.copy(dir).negate();if(n.dot(dir)>0)n.negate();
    const p=hit.position??hit.point;this.hole(p,n,4+Math.random()*2);
    this.burst(p,color,3,1.2,70,{dir:n,cone:.8,life:.3});
    if(sparks||Math.random()<.25)this.burst(p,0xffd27a,2,.6,160,{dir:n,cone:.6,life:.18,gravity:200});
    if(!this.low&&Math.random()<.5)this.smoke(p.clone().addScaledVector(n,3),8,{life:.5,color:0x8a8478,rise:14,grow:26,alpha:.25,spread:8});
    return n;
  }
  // Flesh hit: spray away from the shot and, when there is a floor or wall behind, a stain on it.
  blood(p,dir=null,{color=0x7a1a14,count=7,heavy=false}={}){
    this.burst(p,color,heavy?count*2:count,heavy?2.2:1.5,heavy?150:100,{dir,cone:.8});
    if(!this.raycast||this.low&&Math.random()<.5)return;
    const back=dir?this.raycast(new THREE.Ray(p.clone(),dir.clone().normalize()),2,90):null;
    if(back&&back.triangle){const n=new THREE.Vector3();back.triangle.getNormal(n);this.stain(back.position,n,16+Math.random()*14);return;}
    const down=this.raycast(new THREE.Ray(p.clone(),new THREE.Vector3(0,-1,0)),1,110);
    if(down)this.stain(down.position,_up,(heavy?30:18)+Math.random()*12);
  }
  boom(p,radius=260,color=0xffb44e){
    this.burst(p,color,this.low?12:26,3,radius*.9,{up:1,life:.6});this.burst(p,0x2a2622,this.low?5:12,2.5,radius*.6,{life:.9,floor:p.y-10});
    const b=this.balls[this.ballNext=(this.ballNext+1)%this.balls.length];b.mesh.position.copy(p);b.mesh.material.color.set(color);b.mesh.visible=true;b.life=b.max=.3;b.radius=radius;
    this.light(p.clone().add(new THREE.Vector3(0,20,0)),color,radius*40,.35,radius*3.2);
    for(let i=0;i<(this.low?2:6);i++)this.smoke(p.clone().add(new THREE.Vector3((Math.random()-.5)*radius*.3,10+Math.random()*30,(Math.random()-.5)*radius*.3)),radius*.3,{life:1.6+Math.random(),color:0x3a3632,rise:40,grow:radius*.5,alpha:.5,spread:30});
    if(this.raycast){const down=this.raycast(new THREE.Ray(p.clone().add(new THREE.Vector3(0,10,0)),new THREE.Vector3(0,-1,0)),0,80);if(down)this.stain(down.position,_up,radius*.5,0x0e0c0a);}
  }
  update(dt){
    this.time+=dt;
    let n=0;const list=this.parts;
    for(let i=0;i<list.length;i++){
      const a=list[i];a.life-=dt;if(a.life<=0)continue;
      a.v.y-=a.gravity*dt;if(a.drag)a.v.multiplyScalar(Math.max(0,1-a.drag*dt));a.p.addScaledVector(a.v,dt);
      if(a.floor!==null&&a.p.y<a.floor){a.p.y=a.floor;a.v.y=Math.abs(a.v.y)*.35;a.v.x*=.5;a.v.z*=.5;if(a.shell&&!a.pinged&&a.v.y>20){a.pinged=true;this.onShell?.(a.p);}}
      const s=a.size*Math.min(1,a.life*5);_q.setFromAxisAngle(_up,a.spin+this.time*4);_m.compose(a.p,_q,_s.set(s,s,s));
      this.cubes.setMatrixAt(n,_m);this.cubes.setColorAt(n,_c.set(a.color));list[n++]=a;
    }
    list.length=n;this.cubes.count=n;this.cubes.instanceMatrix.needsUpdate=true;if(this.cubes.instanceColor)this.cubes.instanceColor.needsUpdate=true;
    for(const [arr,mesh] of [[this.holeList,this.holes],[this.stainList,this.stains]]){
      let k=0;for(let i=0;i<arr.length;i++){const d=arr[i];d.life-=dt;if(d.life<=0){this._dirty=true;continue;}if(d.life<2)this._dirty=true;arr[k++]=d;}arr.length=k;
      if(this._dirty||mesh.count!==k){for(let i=0;i<k;i++){const d=arr[i],s=d.size*Math.min(1,d.life/2);_m.compose(d.p,d.q,_s.set(s,s,s));mesh.setMatrixAt(i,_m);mesh.setColorAt(i,_c.set(d.color));}mesh.count=k;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    }
    this._dirty=false;
    for(const t of this.tracers)if(t.life>0){t.life-=dt;t.mesh.material.opacity=.8*Math.max(0,t.life/t.max);if(t.life<=0)t.mesh.visible=false;}
    for(const f of this.flashes)if(f.life>0){f.life-=dt;if(f.life<=0)f.mesh.visible=false;}
    for(const b of this.balls)if(b.life>0){b.life-=dt;const k=1-b.life/b.max;b.mesh.scale.setScalar(b.radius*(.25+k*.75));b.mesh.material.opacity=.7*(1-k);if(b.life<=0)b.mesh.visible=false;}
    for(const s of this.smokes)if(s.life>0){s.life-=dt;const k=1-s.life/s.max;s.mesh.position.addScaledVector(s.v,dt);s.mesh.scale.setScalar(s.size+s.grow*k);s.mesh.material.opacity=s.alpha*Math.min(1,k*8)*(1-k);if(s.life<=0)s.mesh.visible=false;}
    for(const l of this.lights){if(l.life>0){l.life-=dt;l.light.intensity=l.peak*Math.max(0,l.life/l.max);}else l.light.intensity=0;}
  }
  clear(){this.parts.length=0;this.holeList.length=0;this.stainList.length=0;this._dirty=true;for(const g of [this.tracers,this.flashes,this.balls,this.smokes]){for(const x of g){x.life=0;x.mesh.visible=false;}}for(const l of this.lights){l.life=0;l.light.intensity=0;}this.update(0);}
  snapshot(){return {particles:this.parts.length,holes:this.holeList.length,stains:this.stainList.length};}
}
