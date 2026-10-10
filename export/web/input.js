import { settings, actionsFor } from './settings.js';

// Keyboard as named actions (bindings live in settings.js). Typing in a form field never drives the game.
const typing=e=>{const t=e.target;return !!t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable);};
export class Keys {
  constructor({prevent=['Tab','Space','F3']}={}){
    this.down=new Set();this.pressFns=[];this.rawFns=[];this.capture=null;
    addEventListener('keydown',e=>{
      if(this.capture){e.preventDefault();const fn=this.capture;this.capture=null;fn(e.code);return;}
      if(typing(e))return;
      if(prevent.includes(e.code)||actionsFor(e.code).length&&!e.ctrlKey&&!e.metaKey&&!e.code.startsWith('F'))e.preventDefault();
      this.down.add(e.code);if(e.repeat)return;
      for(const fn of this.rawFns)fn(e.code,e);
      for(const a of actionsFor(e.code))for(const fn of this.pressFns)fn(a,e);
    });
    addEventListener('keyup',e=>this.down.delete(e.code));
    addEventListener('blur',()=>this.down.clear());
  }
  held(action){const b=settings.binds[action];return !!b&&b.some(c=>this.down.has(c));}
  axis(positive,negative){return Number(this.held(positive))-Number(this.held(negative));}
  has(code){return this.down.has(code);}
  onPress(fn){this.pressFns.push(fn);}
  onKey(fn){this.rawFns.push(fn);}
  clear(){this.down.clear();}
}
