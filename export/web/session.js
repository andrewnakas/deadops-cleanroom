import { Session } from './rules.js';

// Survival-mode inventory: refinery upgrades, tripmines, wind-up drummers.
export class SurvivalSession extends Session {
  reset(){super.reset();this.refinery=null;this.tripminesOwned=false;this.tripmines=0;this.drummersOwned=false;this.drummers=0;this.equipmentLeft=0;}
  get def(){
    const w=this.weapon,d=this.data.weapons[w.id];
    const base=w.upgraded?{...d,...d.upgrade,id:w.id,upgraded:true,baseName:d.name}:d;
    if(w.lost)return {...base,name:'No weapon',clipSize:0,reserveMax:0};
    return base;
  }
  get weaponUnavailable(){return !!this.weapon.lost||!!(this.refinery?.weapon===this.weapon);}
  get busy(){return ['gameover','reviving'].includes(this.phase)||!!this.drinking||this.meleeLeft>0||this.equipmentLeft>0;}
  update(dt){
    if(this.phase==='gameover')return;
    this.equipmentLeft=Math.max(0,this.equipmentLeft-dt);super.update(dt);
    if(this.refinery&&this.time>=this.refinery.expires){this.refinery.weapon.lost=true;this.refinery.weapon.mag=0;this.refinery.weapon.reserve=0;this.refinery=null;this.lastEvent='Refined weapon was left behind';}
  }
  damage(n){const changed=super.damage(n);if(['reviving','gameover'].includes(this.phase)){this.cancelReload();this.meleeLeft=0;this.equipmentLeft=0;}return changed;}
  fire(){return !this.busy&&!this.weaponUnavailable&&super.fire();}
  reload(){return !this.busy&&!this.weaponUnavailable&&super.reload();}
  switchWeapon(slot){if(this.busy)return false;super.switchWeapon(slot);return true;}
  giveWeapon(id){
    if(this.busy||!this.data.weapons[id])return false;
    if(this.refinery?.weapon===this.weapon)return false;
    if(this.refinery?.weapon.id===id)return false;
    const lost=this.inventory.findIndex(w=>w.lost);
    if(lost>=0){this.inventory[lost]={id,mag:this.data.weapons[id].clipSize,reserve:this.data.weapons[id].reserveMax,upgraded:false};this.slot=lost;this.cancelReload();return true;}
    super.giveWeapon(id);return true;
  }
  beginRefine(){
    const price=this.data.refinery.price;
    if(this.busy||this.refinery||this.weaponUnavailable||!this.power||this.weapon.upgraded||!this.data.weapons[this.weapon.id].upgrade||!this.spend(price))return false;
    this.cancelReload();this.refinery={weapon:this.weapon,readyAt:this.time+4,expires:this.time+19};return true;
  }
  takeRefined(){
    if(this.busy||!this.refinery||this.time<this.refinery.readyAt||this.time>=this.refinery.expires)return false;
    const w=this.refinery.weapon;w.upgraded=true;this.slot=this.inventory.indexOf(w);this.refinery=null;
    w.mag=this.def.clipSize;w.reserve=this.def.reserveMax;this.cancelReload();this.fireLeft=.5;return true;
  }
  buyTripmines(){const e=this.data.equipment.tripmine;if(this.busy||this.tripminesOwned||!this.spend(e.price))return false;this.tripminesOwned=true;this.tripmines=e.count;return true;}
  giveDrummers(){if(this.busy)return false;this.drummersOwned=true;this.drummers=this.data.equipment.drummer.count;return true;}
  useEquipment(kind){if(!['tripmines','drummers'].includes(kind)||this.busy||this[kind]<=0)return false;this[kind]--;this.equipmentLeft=.6;this.cancelReload();return true;}
  nextRound(){super.nextRound();if(this.tripminesOwned)this.tripmines=Math.min(this.data.equipment.tripmine.count,this.tripmines+2);}
  powerup(type){
    super.powerup(type);
    if(type==='supply'){if(this.tripminesOwned)this.tripmines=this.data.equipment.tripmine.count;if(this.drummersOwned)this.drummers=this.data.equipment.drummer.count;}
  }
  snapshot(){return {...super.snapshot(),tripmines:this.tripmines,tripminesOwned:this.tripminesOwned,drummers:this.drummers,drummersOwned:this.drummersOwned,equipmentLeft:this.equipmentLeft,weaponUnavailable:this.weaponUnavailable,refinery:this.refinery?{id:this.refinery.weapon.id,ready:this.time>=this.refinery.readyAt,readyIn:Math.max(0,this.refinery.readyAt-this.time),expiresIn:this.refinery.expires-this.time}:null};}
}
