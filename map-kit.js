import * as THREE from 'three';

// Small level kit: maps are lists of solid boxes and wedge ramps (inches, Y up).
// The same description feeds the renderer, the collision BVH and the navmesh bake,
// so what you see is exactly what you walk on.
export class MapKit {
  constructor(){this.solids=[];this.decor=[];this.entities=[];this.lights=[];}
  // Solid axis-aligned box. flags: {mat, nocollide, nonav, tag, uv}
  box(x0,y0,z0,x1,y1,z1,mat='plaster',flags={}){
    const b={type:'box',min:[Math.min(x0,x1),Math.min(y0,y1),Math.min(z0,z1)],max:[Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1)],mat,...flags};
    (flags.decorOnly?this.decor:this.solids).push(b);return b;
  }
  // Wedge rising along +x/-x/+z/-z from y0 to y1 over its footprint, solid down to base.
  ramp(x0,z0,x1,z1,base,y0,y1,dir,mat='concrete',flags={}){
    const r={type:'ramp',min:[Math.min(x0,x1),base,Math.min(z0,z1)],max:[Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1)],y0,y1,dir,mat,...flags};this.solids.push(r);return r;
  }
  // Wall along X at z (thickness t), spanning x0..x1, y0..y1, with rectangular holes [a0,a1,b0,b1] (x range, y range).
  wallX(z,x0,x1,y0,y1,mat,holes=[],t=12,flags={}){this._wall('x',z,x0,x1,y0,y1,mat,holes,t,flags);}
  wallZ(x,z0,z1,y0,y1,mat,holes=[],t=12,flags={}){this._wall('z',x,z0,z1,y0,y1,mat,holes,t,flags);}
  _wall(axis,c,a0,a1,y0,y1,mat,holes,t,flags){
    // Cut the span into columns at hole edges; each column fills the parts not covered by holes.
    const cuts=[...new Set([a0,a1,...holes.flatMap(h=>[h[0],h[1]])])].filter(v=>v>=a0&&v<=a1).sort((p,q)=>p-q);
    for(let i=0;i<cuts.length-1;i++){
      const s=cuts[i],e=cuts[i+1],mid=(s+e)/2;if(e-s<.01)continue;
      const cover=holes.filter(h=>h[0]<=mid&&h[1]>=mid).map(h=>[Math.max(y0,h[2]),Math.min(y1,h[3])]).sort((p,q)=>p[0]-q[0]);
      let y=y0;
      for(const [h0,h1] of cover){if(h0>y)this._wallPiece(axis,c,s,e,y,h0,mat,t,flags);y=Math.max(y,h1);}
      if(y<y1)this._wallPiece(axis,c,s,e,y,y1,mat,t,flags);
    }
  }
  _wallPiece(axis,c,s,e,y0,y1,mat,t,flags){
    if(axis==='x')this.box(s,y0,c-t/2,e,y1,c+t/2,mat,flags);else this.box(c-t/2,y0,s,c+t/2,y1,e,mat,flags);
  }
  entity(e){this.entities.push(e);return e;}
  light(position,color,intensity,distance){this.lights.push({position,color,intensity,distance});}
}

const faceDefs=[
  // normal, corner picker (uses min/max), uv axes
  {n:[1,0,0],c:(a,b)=>[[b[0],a[1],b[2]],[b[0],a[1],a[2]],[b[0],b[1],a[2]],[b[0],b[1],b[2]]],u:2,v:1},
  {n:[-1,0,0],c:(a,b)=>[[a[0],a[1],a[2]],[a[0],a[1],b[2]],[a[0],b[1],b[2]],[a[0],b[1],a[2]]],u:2,v:1},
  {n:[0,1,0],c:(a,b)=>[[a[0],b[1],b[2]],[b[0],b[1],b[2]],[b[0],b[1],a[2]],[a[0],b[1],a[2]]],u:0,v:2},
  {n:[0,-1,0],c:(a,b)=>[[a[0],a[1],a[2]],[b[0],a[1],a[2]],[b[0],a[1],b[2]],[a[0],a[1],b[2]]],u:0,v:2},
  {n:[0,0,1],c:(a,b)=>[[a[0],a[1],b[2]],[b[0],a[1],b[2]],[b[0],b[1],b[2]],[a[0],b[1],b[2]]],u:0,v:1},
  {n:[0,0,-1],c:(a,b)=>[[b[0],a[1],a[2]],[a[0],a[1],a[2]],[a[0],b[1],a[2]],[b[0],b[1],a[2]]],u:0,v:1},
];
function solidQuads(s){
  const a=s.min,b=s.max;
  if(s.type==='box')return faceDefs.map(f=>({n:f.n,p:f.c(a,b),u:f.u,v:f.v}));
  // Ramp: top surface interpolates y0->y1 along dir.
  const top=(x,z)=>{const t=s.dir==='+x'?(x-a[0])/(b[0]-a[0]):s.dir==='-x'?(b[0]-x)/(b[0]-a[0]):s.dir==='+z'?(z-a[2])/(b[2]-a[2]):(b[2]-z)/(b[2]-a[2]);return s.y0+(s.y1-s.y0)*t;};
  const base=a[1],P=(x,z)=>[x,top(x,z),z];
  const quads=[];
  const t=[P(a[0],b[2]),P(b[0],b[2]),P(b[0],a[2]),P(a[0],a[2])];
  const e1=new THREE.Vector3().subVectors(new THREE.Vector3(...t[1]),new THREE.Vector3(...t[0])),e2=new THREE.Vector3().subVectors(new THREE.Vector3(...t[3]),new THREE.Vector3(...t[0]));
  const n=new THREE.Vector3().crossVectors(e1,e2).normalize().multiplyScalar(-1);if(n.y<0)n.negate();
  quads.push({n:n.toArray(),p:t,u:0,v:2});
  quads.push({n:[0,-1,0],p:[[a[0],base,a[2]],[b[0],base,a[2]],[b[0],base,b[2]],[a[0],base,b[2]]],u:0,v:2});
  quads.push({n:[1,0,0],p:[[b[0],base,b[2]],[b[0],base,a[2]],P(b[0],a[2]),P(b[0],b[2])],u:2,v:1});
  quads.push({n:[-1,0,0],p:[[a[0],base,a[2]],[a[0],base,b[2]],P(a[0],b[2]),P(a[0],a[2])],u:2,v:1});
  quads.push({n:[0,0,1],p:[[a[0],base,b[2]],[b[0],base,b[2]],P(b[0],b[2]),P(a[0],b[2])],u:0,v:1});
  quads.push({n:[0,0,-1],p:[[b[0],base,a[2]],[a[0],base,a[2]],P(a[0],a[2]),P(b[0],a[2])],u:0,v:1});
  return quads;
}
// Merge solids into one BufferGeometry per material with world-space UVs (1 tile per `scale` inches).
export function buildGeometry(solids,{scales={}}={}){
  const groups=new Map();
  for(const s of solids){
    if(s.invisible)continue;
    const g=groups.get(s.mat)??{pos:[],nor:[],uv:[],idx:[]};groups.set(s.mat,g);const scale=s.uvScale??scales[s.mat]??96;
    for(const q of solidQuads(s)){
      // Skip degenerate faces (zero area ramp ends).
      const v0=new THREE.Vector3(...q.p[0]),v1=new THREE.Vector3(...q.p[1]),v2=new THREE.Vector3(...q.p[2]),v3=new THREE.Vector3(...q.p[3]);
      if(new THREE.Vector3().crossVectors(v1.clone().sub(v0),v2.clone().sub(v0)).length()<1e-3&&new THREE.Vector3().crossVectors(v2.clone().sub(v0),v3.clone().sub(v0)).length()<1e-3)continue;
      const base=g.pos.length/3;
      for(const p of q.p){g.pos.push(...p);g.nor.push(...q.n);g.uv.push(p[q.u]/scale,p[q.v]/scale);}
      g.idx.push(base,base+1,base+2,base,base+2,base+3);
    }
  }
  const out=new Map();
  for(const [mat,g] of groups){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(g.pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(g.nor,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(g.uv,2));
    geo.setIndex(g.idx);geo.computeBoundingBox();geo.computeBoundingSphere();out.set(mat,geo);
  }
  return out;
}
// Triangle soup (positions + indices) of everything the player and AI collide with.
export function collisionSoup(solids,filter=s=>!s.nocollide){
  const pos=[],idx=[];
  for(const s of solids){if(!filter(s))continue;for(const q of solidQuads(s)){const base=pos.length/3;for(const p of q.p)pos.push(...p);idx.push(base,base+1,base+2,base,base+2,base+3);}}
  return {positions:new Float32Array(pos),indices:new Uint32Array(idx)};
}
export function boxGeometry(min,max){const geo=new THREE.BoxGeometry(max[0]-min[0],max[1]-min[1],max[2]-min[2]);geo.translate((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2);return geo;}
