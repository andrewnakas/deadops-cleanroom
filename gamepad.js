// Standard-mapping gamepad: left stick move, right stick look, RT fire, LT aim,
// A jump, X use/reload (tap reload, hold use), B crouch, Y swap, RB frag, LB drummer,
// R3 knife, L3 sprint, D-pad down tripmine, Start pause.
const DEAD=.18,dz=v=>Math.abs(v)<DEAD?0:(v-Math.sign(v)*DEAD)/(1-DEAD);
export class Gamepad {
  constructor(){this.index=null;this.prev={};this.state=this.empty();this.handlers={};this.xDown=0;
    addEventListener('gamepadconnected',e=>{this.index=e.gamepad.index;this.handlers.connect?.();});
    addEventListener('gamepaddisconnected',e=>{if(e.gamepad.index===this.index)this.index=null;});}
  on(name,fn){this.handlers[name]=fn;}
  get connected(){return this.index!==null;}
  empty(){return {forward:0,strafe:0,lookX:0,lookY:0,fire:false,aim:false,jump:false,crouch:false,sprint:false,useHeld:false,pressed:{}};}
  poll(){
    const gp=this.index!==null?navigator.getGamepads?.()[this.index]:null;
    if(!gp){this.state=this.empty();return;}
    const b=i=>!!gp.buttons[i]?.pressed,v=i=>gp.buttons[i]?.value??0;
    const now={a:b(0),b:b(1),x:b(2),y:b(3),lb:b(4),rb:b(5),lt:v(6)>.35,rt:v(7)>.35,back:b(8),start:b(9),l3:b(10),r3:b(11),down:b(13)};
    const pressed={},released={};for(const k in now){pressed[k]=now[k]&&!this.prev[k];released[k]=!now[k]&&this.prev[k];}
    if(pressed.x)this.xDown=performance.now();
    const xHeld=now.x&&performance.now()-this.xDown>250;
    this.state={forward:-dz(gp.axes[1]??0),strafe:dz(gp.axes[0]??0),lookX:dz(gp.axes[2]??0),lookY:dz(gp.axes[3]??0),fire:now.rt,aim:now.lt,jump:now.a,crouch:now.b,sprint:now.l3||this.sprintLatch&&Math.abs(gp.axes[1]??0)>.5,useHeld:xHeld,
      pressed:{fire:pressed.rt,start:pressed.start,a:pressed.a,reload:released.x&&!this.xWasHeld,use:released.x||xHeld&&!this.xWasHeld,melee:pressed.r3,grenade:pressed.rb,tactical:pressed.lb,mine:pressed.down,swap:pressed.y}};
    if(pressed.l3)this.sprintLatch=true;if(Math.abs(gp.axes[1]??0)<.3)this.sprintLatch=false;
    this.xWasHeld=xHeld||(now.x&&this.xWasHeld);if(!now.x)this.xWasHeld=false;
    this.prev=now;
  }
  read(){const s=this.state;this.state={...s,pressed:{}};return s;}
}
