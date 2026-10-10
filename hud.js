// HUD widgets shared by every mode: spread crosshair, hit and kill marker,
// directional damage arcs and floating score popups. Plain DOM, styled in ui.css.
const el=(tag,cls,parent)=>{const e=document.createElement(tag);if(cls)e.className=cls;parent?.append(e);return e;};
export class Crosshair {
  constructor(node){this.node=node;node.textContent='';node.classList.add('xhair');for(const c of ['t','b','l','r','dot'])el('i',c,node);this.gap=-1;}
  // spread in radians at the given vertical field of view
  set(spread,fov,{hidden=false,hot=false}={}){
    const gap=Math.round(Math.min(110,Math.max(3,Math.tan(spread)/Math.tan(fov*Math.PI/360)*innerHeight/2)));
    if(gap!==this.gap){this.gap=gap;this.node.style.setProperty('--gap',gap+'px');}
    this.node.style.opacity=hidden?0:1;this.node.classList.toggle('hot',hot);
  }
}
export class HitMarker {
  constructor(node){this.node=node;node.textContent='';node.classList.add('marker');for(const c of ['a','b','c','d'])el('i',c,node);this.until=0;}
  show(now,{head=false,kill=false}={}){this.until=now+(kill?.28:.13);this.node.classList.toggle('head',head);this.node.classList.toggle('kill',kill);}
  update(now){this.node.style.opacity=this.until>now?1:0;}
}
export class DamageArcs {
  constructor(){this.root=el('div','',document.body);this.root.id='damage-arcs';this.list=[];}
  hit(from,now,strength=1){
    if(!from)return;let a=this.list.find(x=>x.from.distanceTo(from)<60);
    if(!a){a={from:from.clone(),node:el('div','arc',this.root)};el('i','',a.node);this.list.push(a);}
    a.from.copy(from);a.until=now+1.6;a.strength=Math.min(1,strength);
  }
  update(camera,now){
    for(const a of [...this.list]){
      const left=a.until-now;if(left<=0){a.node.remove();this.list.splice(this.list.indexOf(a),1);continue;}
      const dx=a.from.x-camera.position.x,dz=a.from.z-camera.position.z,rel=Math.atan2(-dx,-dz)-camera.rotation.y;
      a.node.style.transform=`rotate(${-rel}rad)`;a.node.style.opacity=Math.min(1,left*1.5)*(.55+.45*a.strength);
    }
  }
  clear(){for(const a of this.list)a.node.remove();this.list.length=0;}
}
export class Popups {
  constructor(id='popups'){this.root=el('div','',document.body);this.root.id=id;}
  add(text,cls=''){const n=el('div','pop '+cls,this.root);n.textContent=text;n.addEventListener('animationend',()=>n.remove());while(this.root.childElementCount>6)this.root.firstElementChild.remove();return n;}
  clear(){this.root.textContent='';}
}
// A short banner with a drawn badge (medals, level-ups, challenges).
export class Banners {
  constructor(id='banners'){this.root=el('div','',document.body);this.root.id=id;this.queue=[];this.busyUntil=0;}
  push(title,sub='',glyph='✦',color='#e0b060'){this.queue.push({title,sub,glyph,color});}
  update(nowMs=performance.now()){
    if(nowMs<this.busyUntil||!this.queue.length)return;const b=this.queue.shift();this.busyUntil=nowMs+(this.queue.length>2?450:900);
    const n=el('div','banner',this.root);n.style.setProperty('--c',b.color);n.innerHTML='<b></b><span><strong></strong><em></em></span>';n.querySelector('b').textContent=b.glyph;n.querySelector('strong').textContent=b.title;n.querySelector('em').textContent=b.sub;
    n.addEventListener('animationend',()=>n.remove());while(this.root.childElementCount>3)this.root.firstElementChild.remove();
  }
}
