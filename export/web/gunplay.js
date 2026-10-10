// Shared gun feel for every mode: damage falloff, recoil with recovery, spread bloom.
// Pure maths (no rendering), so the rules can be unit-tested.
const CLASSES={
  pistol:{kick:.013,side:.004,recover:10,hip:.012,bloom:.007,bloomMax:.03,move:.008,speed:1},
  magnum:{kick:.034,side:.007,recover:7,hip:.014,bloom:.02,bloomMax:.05,move:.01,speed:.98},
  smg:{kick:.008,side:.0055,recover:11,hip:.016,bloom:.004,bloomMax:.035,move:.006,speed:1},
  rifle:{kick:.011,side:.0045,recover:10,hip:.014,bloom:.005,bloomMax:.04,move:.012,speed:.95},
  shotgun:{kick:.036,side:.008,recover:7,hip:.02,bloom:.0,bloomMax:0,move:.004,speed:.95},
  sniper:{kick:.055,side:.006,recover:6,hip:.06,bloom:.02,bloomMax:.08,move:.03,speed:.9},
  launcher:{kick:.05,side:.004,recover:6,hip:.02,bloom:0,bloomMax:0,move:.01,speed:.88},
  lmg:{kick:.012,side:.007,recover:8,hip:.022,bloom:.004,bloomMax:.05,move:.016,speed:.86},
  energy:{kick:.006,side:.003,recover:12,hip:.01,bloom:.003,bloomMax:.02,move:.006,speed:.97},
};
export const classOf=def=>CLASSES[def?.class]??CLASSES.rifle;
// Full damage inside the weapon's range, easing down to the minimum by 1.5x that range.
export function falloff(def,distance){
  const max=def.damage??0,min=def.minDamage??max,r=def.range??Infinity;
  if(!(distance>r))return max;const end=r*1.5;if(distance>=end)return min;
  return max+(min-max)*(distance-r)/(end-r);
}
// Hip and aimed spread in radians, after stance, movement and sustained-fire bloom.
export function spreadOf(def,{ads=false,moving=false,air=false,crouch=false,bloom=0,mul=1}={}){
  const c=classOf(def);
  if(def.pellets>1)return Math.max(.055,(def.spread??0)*1.6)*(ads?.85:1);
  const hip=def.spread??c.hip;
  let s=ads?(c===CLASSES.sniper?0:hip*.12):hip;
  s+=bloom*(ads?.35:1);if(moving)s+=c.move*(ads?.4:1);if(air)s=s*1.5+.02;if(crouch)s*=.8;
  return s*mul;
}
export const moveScale=(def,ads)=>classOf(def).speed*(def.moveScale??1)*(ads?.62:1);
// Camera recoil: each shot kicks up and a little sideways on a repeatable pattern; most of the climb settles back.
export class Recoil {
  constructor(random=Math.random){this.random=random;this.reset();}
  reset(){this.pitch=0;this.yaw=0;this.bloom=0;this.shots=0;this.since=9;}
  kick(def,{ads=false,mul=1}={}){
    const c=classOf(def),m=(ads?.62:1)*mul*(def.recoilScale??1);
    const up=c.kick*m*(1+Math.min(this.shots,6)*.04),side=(Math.sin(this.shots*1.9+.6)*.7+(this.random()-.5)*.6)*c.side*m;
    this.pitch+=up;this.yaw+=side;this.bloom=Math.min(c.bloomMax,this.bloom+c.bloom);this.shots++;this.since=0;this.rate=c.recover;
    return {pitch:up,yaw:side};
  }
  // Returns the camera correction for this frame (add to pitch and yaw).
  update(dt){
    this.since+=dt;if(this.since>.25)this.shots=0;
    this.bloom=Math.max(0,this.bloom-dt*.09);
    if(this.since<.07||(!this.pitch&&!this.yaw))return {pitch:0,yaw:0};
    const f=1-Math.exp(-(this.rate??9)*dt),dp=this.pitch*f,dy=this.yaw*f;this.pitch-=dp;this.yaw-=dy;
    if(Math.abs(this.pitch)<1e-5)this.pitch=0;if(Math.abs(this.yaw)<1e-5)this.yaw=0;
    return {pitch:-dp*.72,yaw:-dy*.5};
  }
}
// How many bodies / thin walls a round passes through and what it keeps after each.
export const pierceCount=def=>Math.max(1,def.pierce??(def.class==='sniper'?2:1));
export const wallPierce=def=>def.wallPierce??({sniper:14,rifle:7,lmg:9,magnum:5}[def.class]??0);
