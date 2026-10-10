import { settings, setSetting, resetSettings, rebind, ACTIONS, keyLabel, onSettings } from './settings.js';

// Menu pieces shared by every mode: the settings panel and small DOM helpers.
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=id=>document.getElementById(id);
const ROWS=[
  ['Controls'],
  ['range','sens','Mouse sensitivity',.2,3,.05,v=>v.toFixed(2)+'×'],
  ['range','adsSens','Aiming sensitivity',.2,3,.05,v=>v.toFixed(2)+'×'],
  ['range','padSens','Controller sensitivity',.2,3,.05,v=>v.toFixed(2)+'×'],
  ['check','invertY','Invert look up / down'],
  ['check','adsToggle','Aim is a toggle'],
  ['check','aimAssist','Aim assist (controller and touch)'],
  ['Video'],
  ['range','fov','Field of view',60,100,1,v=>Math.round(v)+'°'],
  ['select','quality','Graphics',[['auto','Auto'],['low','Low'],['medium','Medium'],['high','High']]],
  ['check','shake','Camera bob and shake'],
  ['check','colorblind','High-contrast team colours'],
  ['Audio'],
  ['range','master','Master volume',0,1,.05,v=>Math.round(v*100)+'%'],
  ['range','sfx','Effects',0,1,.05,v=>Math.round(v*100)+'%'],
  ['range','music','Music',0,1,.05,v=>Math.round(v*100)+'%'],
  ['range','voice','Announcer',0,1,.05,v=>Math.round(v*100)+'%'],
];
// Adds a SETTINGS button after `anchor` and builds the panel. `actions` limits the key list to what the mode uses.
export function mountSettings({anchor,keys,actions=Object.keys(ACTIONS),onChange}={}){
  const open=document.createElement('button');open.type='button';open.id='open-settings';open.className='secondary';open.textContent='SETTINGS';anchor.after(open);
  const panel=document.createElement('section');panel.id='settings';panel.hidden=true;
  panel.innerHTML=`<div class="settings-box"><header><h2>Settings</h2><button type="button" id="close-settings">DONE</button></header><div class="settings-body"></div>
    <footer><button type="button" id="reset-settings">RESET TO DEFAULTS</button><span id="settings-note"></span></footer></div>`;
  document.body.append(panel);
  const body=panel.querySelector('.settings-body'),note=panel.querySelector('#settings-note');
  function build(){
    body.textContent='';
    for(const r of ROWS){
      if(r.length===1){const h=document.createElement('h3');h.textContent=r[0];body.append(h);continue;}
      const [type,key,label]=r,row=document.createElement('label');row.className='set-row';row.innerHTML=`<span>${label}</span>`;
      if(type==='range'){const [, , ,min,max,step,fmt]=r,i=document.createElement('input'),o=document.createElement('output');i.type='range';i.min=min;i.max=max;i.step=step;i.value=settings[key];o.textContent=fmt(settings[key]);
        i.addEventListener('input',()=>{setSetting(key,+i.value);o.textContent=fmt(settings[key]);onChange?.(key);});row.append(i,o);}
      if(type==='check'){const i=document.createElement('input');i.type='checkbox';i.checked=settings[key];i.addEventListener('change',()=>{setSetting(key,i.checked);onChange?.(key);});row.append(i);}
      if(type==='select'){const s=document.createElement('select');for(const [v,t] of r[3]){const o=document.createElement('option');o.value=v;o.textContent=t;o.selected=settings[key]===v;s.append(o);}
        s.addEventListener('change',()=>{setSetting(key,s.value);onChange?.(key);if(key==='quality')note.textContent='Shadows change the next time the page loads.';});row.append(s);}
      body.append(row);
    }
    const h=document.createElement('h3');h.textContent='Keys';body.append(h);
    for(const a of actions){
      const row=document.createElement('div');row.className='set-row keys';row.innerHTML=`<span>${ACTIONS[a]}</span>`;
      for(let slot=0;slot<2;slot++){const b=document.createElement('button');b.type='button';b.textContent=keyLabel(settings.binds[a][slot]);
        b.addEventListener('click',()=>{if(!keys)return;b.textContent='press a key…';b.classList.add('waiting');keys.capture=code=>{if(code!=='Escape')rebind(a,code,slot);build();onChange?.('binds');};});row.append(b);}
      body.append(row);
    }
  }
  const show=v=>{panel.hidden=!v;if(v)build();else if(keys)keys.capture=null;};
  open.addEventListener('click',()=>show(true));panel.querySelector('#close-settings').addEventListener('click',()=>show(false));
  panel.addEventListener('click',e=>{if(e.target===panel)show(false);});
  panel.querySelector('#reset-settings').addEventListener('click',()=>{resetSettings();build();onChange?.(null);});
  onSettings(k=>{if(k===null&&!panel.hidden)build();});
  return {open:()=>show(true),close:()=>show(false),get visible(){return !panel.hidden;}};
}
