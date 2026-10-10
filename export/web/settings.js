// Player settings shared by every mode: one object persisted in localStorage.
// Works without a DOM (unit tests import it under node).
const KEY='graveshift.settings',store=globalThis.localStorage??null;
export const ACTIONS={forward:'Move forward',back:'Move back',left:'Strafe left',right:'Strafe right',jump:'Jump / mantle',crouch:'Crouch / slide',sprint:'Sprint',
  reload:'Reload',use:'Use / interact',melee:'Melee',lethal:'Lethal',tactical:'Tactical',equipment:'Equipment',swap:'Swap weapon',weapon1:'Weapon 1',weapon2:'Weapon 2',weapon3:'Weapon 3',
  streak:'Call in streak',scores:'Scoreboard',chat:'Chat',inspect:'Inspect weapon',mute:'Mute sound'};
export const DEFAULT_BINDS={forward:['KeyW','ArrowUp'],back:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],jump:['Space'],crouch:['KeyC','ControlLeft'],sprint:['ShiftLeft','ShiftRight'],
  reload:['KeyR'],use:['KeyF','KeyE'],melee:['KeyV'],lethal:['KeyG'],tactical:['KeyX'],equipment:['Digit4'],swap:['KeyQ'],weapon1:['Digit1'],weapon2:['Digit2'],weapon3:['Digit3'],
  streak:['Digit5'],scores:['Tab'],chat:['KeyT'],inspect:['KeyI'],mute:['KeyM']};
export const DEFAULTS={sens:1,adsSens:1,padSens:1,invertY:false,fov:78,master:.8,music:.7,sfx:1,voice:.9,quality:'auto',adsToggle:false,aimAssist:true,colorblind:false,shake:true,hints:true,binds:DEFAULT_BINDS};
const RANGES={sens:[.2,3],adsSens:[.2,3],padSens:[.2,3],fov:[60,100],master:[0,1],music:[0,1],sfx:[0,1],voice:[0,1]};
const clone=v=>JSON.parse(JSON.stringify(v));
export function sanitize(raw={}){
  const out=clone(DEFAULTS);
  for(const [k,d] of Object.entries(DEFAULTS)){
    const v=raw?.[k];if(v===undefined||v===null||k==='binds')continue;
    if(typeof d==='number'){const n=+v;if(Number.isFinite(n)){const [lo,hi]=RANGES[k]??[-Infinity,Infinity];out[k]=Math.min(hi,Math.max(lo,n));}}
    else if(typeof d==='boolean')out[k]=!!v;
    else if(k==='quality')out[k]=['auto','low','medium','high'].includes(v)?v:d;
  }
  for(const a of Object.keys(DEFAULT_BINDS)){const b=raw?.binds?.[a];if(Array.isArray(b)&&b.length&&b.every(c=>typeof c==='string'))out.binds[a]=b.slice(0,2);}
  return out;
}
function read(){try{return sanitize(JSON.parse(store?.getItem(KEY)||'{}'));}catch{return clone(DEFAULTS);}}
export const settings=read();
const listeners=new Set();
export function onSettings(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function saveSettings(){try{store?.setItem(KEY,JSON.stringify(settings));}catch{}}
export function setSetting(key,value){Object.assign(settings,sanitize({...settings,[key]:value}));saveSettings();for(const fn of listeners)fn(key,settings[key]);}
export function resetSettings(){Object.assign(settings,clone(DEFAULTS));saveSettings();for(const fn of listeners)fn(null);}
// Bind one key to an action; a key can only drive one action, so it is taken off the others.
export function rebind(action,code,slot=0){
  if(!DEFAULT_BINDS[action])return false;
  for(const [a,list] of Object.entries(settings.binds))if(a!==action)settings.binds[a]=list.filter(c=>c!==code);
  const list=settings.binds[action].filter(c=>c!==code);list[Math.min(slot,list.length)]=code;settings.binds[action]=list.slice(0,2);
  for(const a of Object.keys(DEFAULT_BINDS))if(!settings.binds[a].length&&!Object.values(settings.binds).flat().includes(DEFAULT_BINDS[a][0]))settings.binds[a]=[DEFAULT_BINDS[a][0]];
  saveSettings();for(const fn of listeners)fn('binds',settings.binds);return true;
}
export const actionsFor=code=>Object.keys(settings.binds).filter(a=>settings.binds[a].includes(code));
export const keyLabel=code=>(code??'—').replace(/^Key/,'').replace(/^Digit/,'').replace('Arrow','').replace('ShiftLeft','Shift').replace('ShiftRight','R-Shift').replace('ControlLeft','Ctrl').replace('ControlRight','R-Ctrl').replace('Space','Space').toUpperCase();
export const bindLabel=action=>keyLabel(settings.binds[action]?.[0]);
// 'auto' picks by device: phones get the light path, desktops the full one.
export const qualityTier=mobile=>settings.quality==='auto'?(mobile?'low':'high'):settings.quality;
