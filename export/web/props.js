import * as THREE from 'three';

// Procedural props (own work, CC0). Units are inches; models face +Z.
export function canvasTexture(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
const std=(color,o={})=>new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.1,...o});
const glow=(color,map=null,intensity=1.6)=>new THREE.MeshStandardMaterial({color:0x111111,emissive:color,emissiveIntensity:intensity,emissiveMap:map,map,roughness:.4});
function mesh(geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);return m;}
const box=(w,h,d,mat,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
function signTexture(text,color,sub=''){
  return canvasTexture(512,160,(g,w,h)=>{
    g.fillStyle='#0b0b0d';g.fillRect(0,0,w,h);g.strokeStyle=color;g.lineWidth=10;g.strokeRect(8,8,w-16,h-16);
    g.fillStyle=color;g.font='bold 70px "Trebuchet MS",Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text.toUpperCase(),w/2,sub?h*.42:h/2,w-40);
    if(sub){g.font='bold 30px Arial';g.fillStyle='#f4ecd8';g.fillText(sub,w/2,h*.8,w-40);}
  });
}
export function perkMachine(def){
  const root=new THREE.Group(),color=new THREE.Color(def.color);
  const body=std(color.clone().multiplyScalar(.75),{roughness:.45,metalness:.3}),trim=std(0xd9cfb8,{metalness:.6,roughness:.3}),dark=std(0x161414);
  root.add(box(34,78,24,body,0,39,0),box(36,4,26,trim,0,80,0),box(36,4,26,trim,0,2,0));
  const sign=box(32,14,2,glow(color,signTexture(def.name,def.color),1.4),0,68,12.5);root.add(sign);
  // bottle window with a row of bottles
  root.add(box(26,22,1,dark,0,40,12.2));
  for(let i=-2;i<=2;i++){const b=bottle(def.color);b.scale.setScalar(.8);b.position.set(i*5,31,12);root.add(b);}
  root.add(box(10,6,2,std(0x222222),0,18,12.5),box(6,2,3,trim,8,50,13));
  const light=new THREE.PointLight(color,0,140,1.5);light.position.set(0,60,30);root.add(light);
  root.userData={light,sign:sign.material};
  return root;
}
export function bottle(color='#cc4444'){
  const g=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color,roughness:.15,metalness:.1,transparent:true,opacity:.85,emissive:new THREE.Color(color).multiplyScalar(.25)});
  g.add(mesh(new THREE.CylinderGeometry(1.6,1.6,6,12),glass,0,3,0),mesh(new THREE.CylinderGeometry(.6,1.6,2.5,12),glass,0,7.2,0),mesh(new THREE.CylinderGeometry(.7,.7,1,10),std(0xc9b26a,{metalness:.7}),0,8.8,0));
  const label=mesh(new THREE.CylinderGeometry(1.65,1.65,2.4,12,1,true),std(0xf2ead2),0,3,0);g.add(label);return g;
}
export function luckyCrate(){
  const root=new THREE.Group(),wood=std(0x6b4a2b,{roughness:.8}),band=std(0x2c2a28,{metalness:.6,roughness:.4});
  root.add(box(56,22,26,wood,0,11,0));for(const x of [-26,26])root.add(box(3,23,27,band,x,11.5,0));
  const qmark=canvasTexture(256,128,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);g.fillStyle='#9fd4ff';g.font='bold 100px Georgia,serif';g.textAlign='center';g.textBaseline='middle';for(let i=0;i<3;i++)g.fillText('?',w*(.2+i*.3),h/2+4);});
  root.add(box(40,10,.6,glow(0x9fd4ff,qmark,1.2),0,12,13.3));
  const lid=new THREE.Group();lid.position.set(0,22,-13);const lidBox=box(56,5,26,wood,0,2.5,13);lid.add(lidBox,box(57,2,27,band,0,1,13));root.add(lid);
  root.userData={lid};return root;
}
export function refineryMachine(){
  const root=new THREE.Group(),steel=std(0x4a5560,{metalness:.7,roughness:.35}),dark=std(0x1d2126,{metalness:.5}),brass=std(0xb9913f,{metalness:.8,roughness:.3});
  root.add(box(70,46,40,steel,0,23,0),box(74,4,44,brass,0,47,0),box(54,24,30,dark,0,61,0));
  const rollers=[];for(const x of [-18,0,18]){const r=mesh(new THREE.CylinderGeometry(7,7,32,16),brass,x,61,0);r.rotation.x=Math.PI/2;root.add(r);rollers.push(r);}
  const sign=box(60,12,2,glow(0xff7b2e,signTexture('The Refinery','#ff8a3d','5000 · POWER REQUIRED'),1.5),0,82,10);root.add(sign);
  root.add(box(36,8,2,glow(0x55ccff,null,.9),0,30,20.5));
  const light=new THREE.PointLight(0xff9a50,0,220,1.5);light.position.set(0,70,40);root.add(light);
  root.userData={rollers,light};return root;
}
export function powerSwitch(){
  const root=new THREE.Group(),panel=std(0x38403a,{metalness:.5});
  root.add(box(30,44,6,panel,0,52,0),box(26,10,1,glow(0xffc040,signTexture('MAIN POWER','#ffc040'),1),0,80,3.5));
  const lever=new THREE.Group();lever.position.set(0,52,3);lever.add(box(3,18,3,std(0x999999,{metalness:.8}),0,9,2),box(8,4,4,std(0xaa2222),0,18,2));lever.rotation.x=.7;root.add(lever);
  root.userData={lever};return root;
}
// Chalk outline + name on the wall; the CC0 gun model hangs in front.
export function wallChalk(name,price){
  const tex=canvasTexture(256,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle='rgba(240,236,220,.85)';g.lineWidth=3;g.setLineDash([6,4]);g.strokeRect(12,10,w-24,h-48);g.setLineDash([]);
    g.fillStyle='rgba(240,236,220,.92)';g.font='bold 22px Arial';g.textAlign='center';g.fillText(name.toUpperCase()+'  ·  '+price,w/2,h-14,w-16);});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(48,24),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));m.position.set(0,58,.6);return m;
}
export function powerupToken(def){
  const tex=canvasTexture(128,128,(g,w,h)=>{const grd=g.createRadialGradient(64,64,10,64,64,64);grd.addColorStop(0,'#fff8d8');grd.addColorStop(.6,def.color);grd.addColorStop(1,'#2a1c08');g.fillStyle=grd;g.beginPath();g.arc(64,64,62,0,7);g.fill();
    g.fillStyle='#1a1206';g.font='bold 54px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(def.glyph,64,68,110);});
  const mat=new THREE.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.7,metalness:.6,roughness:.3});
  const coin=new THREE.Mesh(new THREE.CylinderGeometry(12,12,2.5,24),[std(0xb08a2e,{metalness:.8,roughness:.3}),mat,mat]);coin.rotation.x=Math.PI/2;
  const g=new THREE.Group();g.add(coin);return g;
}
export function mothFigure(){
  const g=new THREE.Group(),fur=std(0xd8d2c0,{roughness:.9}),wing=new THREE.MeshStandardMaterial({color:0xa89a80,side:THREE.DoubleSide,roughness:.9});
  g.add(mesh(new THREE.SphereGeometry(4,10,8),fur,0,0,0),mesh(new THREE.SphereGeometry(3,10,8),fur,0,5,1));
  for(const s of [-1,1]){const w=mesh(new THREE.CircleGeometry(9,10),wing,s*8,2,0);w.scale.set(1,.7,1);w.rotation.y=s*.4;g.add(w);}
  return g;
}
export function drummerToy(){
  const g=new THREE.Group();g.add(mesh(new THREE.CylinderGeometry(4,4,4,16),std(0xb03030),0,2,0),mesh(new THREE.SphereGeometry(3,10,8),std(0x5b3a1c),0,7,0),mesh(new THREE.CylinderGeometry(4.2,4.2,.5,16),std(0xe8e0c8),0,4.2,0));
  const sticks=[];for(const s of [-1,1]){const st=mesh(new THREE.CylinderGeometry(.3,.3,6,6),std(0xcfb88a),s*3,6,1.5);g.add(st);sticks.push(st);}g.userData.sticks=sticks;return g;
}
export function planks(width,height,mats){
  const g=new THREE.Group(),n=Math.max(3,Math.round(height/14)),boards=[];
  for(let i=0;i<n;i++){const b=box(width+10,9,3,mats.planks,0,(i+.5)*height/n,0);b.rotation.z=(i%2?1:-1)*.12;g.add(b);boards.push(b);}
  return {group:g,boards};
}
const POSTERS=[
  ['NIGHT OF THE MOTHS','#2a1840','#f2c14e','They came for the light.'],
  ['THE LAST MATINEE','#3a0e0e','#f4e4c1','No one leaves before the credits.'],
  ['MARS NEEDS POPCORN','#0d2a3a','#ff9f43','A comedy of cosmic proportions!'],
  ['COUNT VOLTAGE','#1a1a1a','#7fd4ff','The most shocking picture of the year.'],
  ['STARLIGHT REVUE','#40301a','#ffd36e','Song! Dance! Fifty dancing girls!'],
  ['THE HOLLOW REEL','#122012','#b8e986','Some films should never be screened.'],
];
export function poster(index){
  const [title,bg,fg,tag]=POSTERS[index%POSTERS.length];
  const tex=canvasTexture(256,384,(g,w,h)=>{
    const grd=g.createLinearGradient(0,0,0,h);grd.addColorStop(0,bg);grd.addColorStop(1,'#050505');g.fillStyle=grd;g.fillRect(0,0,w,h);
    g.fillStyle=fg;g.globalAlpha=.85;g.beginPath();g.arc(w/2,h*.4,70+index*6,0,7);g.fill();g.globalAlpha=1;
    g.fillStyle='#0a0a0a';g.beginPath();g.moveTo(w*.3,h*.62);g.lineTo(w*.5,h*.26+index*4);g.lineTo(w*.7,h*.62);g.fill();
    g.fillStyle=fg;g.font='bold 34px Georgia,serif';g.textAlign='center';
    const words=title.split(' ');let line='',y=h*.72;for(const word of words){if(g.measureText(line+' '+word).width>w-30){g.fillText(line.trim(),w/2,y);y+=36;line='';}line+=' '+word;}g.fillText(line.trim(),w/2,y);
    g.font='italic 15px Georgia,serif';g.fillStyle='#e8dcc0';g.fillText(tag,w/2,h-22,w-20);
    g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=6;g.strokeRect(3,3,w-6,h-6);
    // age it
    for(let i=0;i<500;i++){g.fillStyle=`rgba(${120+Math.random()*80|0},${100+Math.random()*60|0},70,${Math.random()*.08})`;g.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*10,2+Math.random()*10);}
  });
  const m=new THREE.Mesh(new THREE.PlaneGeometry(40,60),new THREE.MeshStandardMaterial({map:tex,roughness:.85}));return m;
}
// Animated projector screen: a flickering, scratched reel of an original silhouette loop.
export function filmScreen(width,height){
  const c=document.createElement('canvas');c.width=256;c.height=144;const g=c.getContext('2d');
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
  let t=0;
  m.userData.update=(dt,power)=>{
    t+=dt;if(Math.floor(t*12)===m.userData.frame)return;m.userData.frame=Math.floor(t*12);
    const w=c.width,h=c.height,flick=.75+Math.random()*.25;
    g.fillStyle=power?`rgb(${200*flick|0},${190*flick|0},${170*flick|0})`:'#0c0c0c';g.fillRect(0,0,w,h);
    if(power){
      // a moth fluttering around a lamp: simple original animation
      g.fillStyle='#1a1410';g.fillRect(w*.47,h*.55,w*.06,h*.45);g.beginPath();g.arc(w*.5,h*.5,18,0,7);g.fill();
      const a=t*1.7,x=w*.5+Math.cos(a)*60,y=h*.45+Math.sin(a*2)*25,flap=Math.abs(Math.sin(t*20))*10;
      g.beginPath();g.ellipse(x-6,y,8,3+flap,.5,0,7);g.ellipse(x+6,y,8,3+flap,-.5,0,7);g.fill();
      for(let i=0;i<6;i++){g.fillStyle=`rgba(0,0,0,${Math.random()*.4})`;g.fillRect(Math.random()*w,0,1,h);}
    }else{for(let i=0;i<40;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*.07})`;g.fillRect(Math.random()*w,Math.random()*h,2,2);}}
    tex.needsUpdate=true;
  };
  return m;
}
