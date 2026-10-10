// Procedural sound (own work, CC0): every effect and the music are synthesised with
// WebAudio at runtime. Announcer lines are Piper TTS renders in audio/voice/*.ogg.
import { settings, onSettings } from './settings.js';
const MOTIFS={perk_wind:[0,4,7,12,7],perk_hide:[0,3,7,3,0,-5],perk_hands:[0,2,4,7,9,12],perk_trigger:[0,7,5,7,12,7],perk_stride:[0,5,7,5,12,7],perk_holster:[0,4,9,4,7,12],perk_ward:[0,-2,3,7,3,0],perk_marks:[0,7,12,16,12,7],perk_mender:[0,2,5,9,5,2]};
// Step-sequenced music: 16 steps a bar, semitones from A. null = rest.
const _=null;
const TRACKS={
  menu:{bpm:66,gain:.5,pad:[[0,3,7],[-4,0,3],[-7,-4,0],[-5,-2,2]],lead:[0,_,_,7,_,_,3,_,_,_,2,_,0,_,_,_],leadType:'sine',leadOct:2},
  calm:{bpm:60,gain:.4,pad:[[0,3,7],[-2,2,5]],lead:[_,_,_,_,12,_,_,_,_,_,10,_,_,_,7,_],leadType:'sine',leadOct:2},
  fight:{bpm:112,gain:.55,bass:[0,_,0,_,0,_,3,_,0,_,0,_,-2,_,-4,_],pad:[[0,3,7],[0,3,7],[-4,0,3],[-2,2,5]],kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0],hat:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,1]},
  hounds:{bpm:138,gain:.6,bass:[0,0,_,0,1,_,0,_,0,0,_,0,-1,_,1,_],pad:[[0,1,6],[0,1,6]],kick:[1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
  boss:{bpm:96,gain:.6,bass:[0,_,_,0,_,_,-1,_,0,_,_,0,_,_,-5,_],pad:[[0,3,6],[-1,2,6]],kick:[1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1]},
  match:{bpm:124,gain:.42,bass:[0,_,_,0,_,_,0,_,3,_,_,3,_,_,-2,_],kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],hat:[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0]},
  final:{bpm:146,gain:.55,bass:[0,_,0,_,3,_,0,_,5,_,3,_,0,_,-2,_],pad:[[0,3,7],[3,7,10]],kick:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0],hat:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],snare:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
  lobby:{bpm:92,gain:.4,bass:[0,_,_,_,_,_,3,_,_,_,_,_,-2,_,_,_],pad:[[0,3,7,10],[-4,0,3,7]],hat:[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],lead:[_,_,12,_,_,_,10,_,_,7,_,_,_,_,3,_],leadType:'triangle',leadOct:1},
  gameover:{bpm:54,gain:.5,pad:[[0,3,7],[-5,-2,2],[-7,-4,0],[-12,-5,0]],lead:[12,_,_,_,10,_,_,_,7,_,_,_,3,_,_,_],leadType:'sine',leadOct:1},
};
const STEP_SURFACE={hard:[1800,.05,.22],wood:[700,.07,.26],carpet:[420,.09,.14],grass:[2600,.1,.12],metal:[2400,.06,.24],water:[900,.14,.22]};
export class GameAudio {
  constructor({ambience=true}={}){this.scale=1;this._enabled=true;this.ctx=null;this.played=[];this.voices={};this.voiceList=[];this.wantAmbience=ambience;this.track=null;this.wantTrack=null;this.step16=0;this.nextStep=0;this.ear=null;this.speakUntil=0;this.voiceQueue=[];
    onSettings(()=>this.applyVolumes());}
  async load(){try{const r=await fetch('audio/voice/manifest.json');if(r.ok)this.voiceList=await r.json();}catch{}}
  get enabled(){return this._enabled;}
  set enabled(v){this._enabled=v;this.applyVolumes();}
  applyVolumes(){
    if(!this.ctx)return;
    this.master.gain.value=this._enabled?.625*settings.master:0;this.music.gain.value=.314*settings.music;this.sfx.gain.value=settings.sfx;this.voiceBus.gain.value=settings.voice;
  }
  start(){
    if(!this.ctx){const C=globalThis.AudioContext??globalThis.webkitAudioContext;if(!C){this._enabled=false;return;}
      const c=this.ctx=new C();this.master=c.createGain();
      const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;this.master.connect(comp);comp.connect(c.destination);
      const len=c.sampleRate*2;this.noise=c.createBuffer(1,len,c.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.music=c.createGain();this.music.connect(this.master);this.sfx=c.createGain();this.sfx.connect(this.master);this.voiceBus=c.createGain();this.voiceBus.connect(this.master);this.out=this.sfx;
      // room tail: a generated impulse, fed by a send that game code turns up indoors
      const il=Math.floor(c.sampleRate*1.7),imp=c.createBuffer(2,il,c.sampleRate);for(let ch=0;ch<2;ch++){const b=imp.getChannelData(ch);for(let i=0;i<il;i++)b[i]=(Math.random()*2-1)*Math.pow(1-i/il,2.6);}
      this.reverb=c.createConvolver();this.reverb.buffer=imp;this.send=c.createGain();this.send.gain.value=.12;this.sfx.connect(this.send);this.send.connect(this.reverb);this.reverb.connect(this.master);
      this.applyVolumes();
      for(const key of this.voiceList)this.loadVoice(key);
      this.seq=setInterval(()=>this.sequence(),90);
    }
    this.ctx.resume();if(this.wantAmbience&&!this.ambient)this.startAmbience();
  }
  pause(){this.ctx?.suspend();}
  get ok(){return this._enabled&&this.ctx&&this.ctx.state==='running';}
  log(k){this.played.push(k);if(this.played.length>30)this.played.shift();}
  setReverb(amount){if(this.send)this.send.gain.setTargetAtTime(amount,this.ctx.currentTime,.4);}
  env(g,t,a,peak,decay){peak*=this.scale;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+decay);}
  noiseHit({t=this.ctx.currentTime,type='lowpass',f=2000,f2=null,q=.7,vol=.5,a=.002,d=.2,dest=this.out,rate=1}){
    const s=this.ctx.createBufferSource(),fl=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;s.playbackRate.value=rate;
    fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+a+d);fl.Q.value=q;
    s.connect(fl);fl.connect(g);g.connect(dest);this.env(g,t,a,vol,d);s.start(t,Math.random()*1.5);s.stop(t+a+d+.05);
  }
  tone({t=this.ctx.currentTime,type='sine',f=440,f2=null,vol=.3,a=.005,d=.3,dest=this.out,detune=0}){
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+a+d);o.detune.value=detune;
    o.connect(g);g.connect(dest);this.env(g,t,a,vol,d);o.start(t);o.stop(t+a+d+.05);
  }
  // ----- positional sound -----
  // Call once a frame with the camera so world sounds pan and fade around the listener.
  listen(camera){
    if(!this.ctx)return;const l=this.ctx.listener,p=camera.position,e=camera.matrixWorld.elements;this.ear=p;
    if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y;l.positionZ.value=p.z;l.forwardX.value=-e[8];l.forwardY.value=-e[9];l.forwardZ.value=-e[10];l.upX.value=e[4];l.upY.value=e[5];l.upZ.value=e[6];}
    else{l.setPosition?.(p.x,p.y,p.z);l.setOrientation?.(-e[8],-e[9],-e[10],e[4],e[5],e[6]);}
  }
  // Play whatever `fn` triggers at a world position (panned, distance-faded up to `range`).
  at3(pos,fn,range=1800,volume=1){
    if(!this.ok)return;if(this.ear&&this.ear.distanceTo(pos)>range)return;
    const p=this.ctx.createPanner();p.panningModel=settings.quality==='low'?'equalpower':'HRTF';p.distanceModel='linear';p.refDistance=90;p.maxDistance=range;p.rolloffFactor=1;
    if(p.positionX){p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;}else p.setPosition(pos.x,pos.y,pos.z);
    p.connect(this.sfx);const old=this.out,os=this.scale;this.out=p;this.scale=volume;try{fn();}finally{this.out=old;this.scale=os;}
    setTimeout(()=>{try{p.disconnect();}catch{}},4000);
  }
  at(volume,fn){if(volume<=.02)return;const old=this.scale;this.scale=volume;try{fn();}finally{this.scale=old;}}
  shot(def){
    if(!this.ok)return;this.log('shot:'+def.class);const c=def.class,quiet=def.suppressed?.45:1;
    if(c==='energy'){this.tone({type:'square',f:1400,f2:180,vol:.18,d:.22});this.tone({type:'sawtooth',f:700,f2:90,vol:.12,d:.3,detune:12});this.noiseHit({type:'bandpass',f:3000,q:2,vol:.15,d:.1});return;}
    if(c==='launcher'){this.noiseHit({f:900,f2:200,vol:.6,d:.35});this.tone({f:90,f2:40,vol:.5,d:.3});return;}
    const big=c==='shotgun'||c==='sniper'||c==='magnum';
    if(def.suppressed){this.noiseHit({type:'bandpass',f:1500,q:1.2,vol:.3,d:.07});this.tone({f:160,f2:70,vol:.18,d:.07});return;}
    this.noiseHit({type:'highpass',f:big?900:1600,vol:(big?.55:.4)*quiet,d:big?.08:.05});
    this.noiseHit({f:big?1400:2600,f2:big?160:400,vol:(big?.75:.55)*quiet,d:big?.42:c==='pistol'?.18:.14});
    this.tone({f:big?95:c==='lmg'?110:140,f2:40,vol:(big?.6:.38)*quiet,d:big?.22:.12});
    if(c==='sniper')this.noiseHit({t:this.ctx.currentTime+.05,f:500,f2:120,vol:.3,d:.8});
  }
  dry(){if(!this.ok)return;this.noiseHit({type:'bandpass',f:4200,q:6,vol:.3,d:.03});}
  reload(stage,duration=1){
    if(!this.ok)return;const t=this.ctx.currentTime;
    const click=(at,f,v=.35)=>this.noiseHit({t:t+at,type:'bandpass',f,q:5,vol:v,d:.04});
    if(stage==='shell'){click(.1,2400);click(.18,1600,.2);return;}
    if(stage==='start'||stage==='end'){click(.05,1400);click(.15,900,.4);return;}
    click(duration*.15,1800);click(duration*.2,1200,.2);click(duration*.7,2200);click(duration*.78,1500,.4);
  }
  knife(kind){
    if(!this.ok)return;
    if(kind==='swing')this.noiseHit({type:'bandpass',f:600,f2:3000,q:1.5,vol:.35,a:.04,d:.18});
    else if(kind==='hit'){this.noiseHit({f:700,vol:.6,d:.12});this.tone({f:120,f2:60,vol:.4,d:.12});}
    else this.noiseHit({type:'bandpass',f:2800,q:4,vol:.35,d:.06});
  }
  step(surface='hard',volume=1){
    if(!this.ok)return;const [f,d,v]=STEP_SURFACE[surface]??STEP_SURFACE.hard;
    this.noiseHit({type:'bandpass',f:f*(.85+Math.random()*.3),q:1.2,vol:v*volume,a:.004,d});this.tone({f:70+Math.random()*20,f2:45,vol:.12*volume,d:.06});
  }
  growl(volume=1,pitch=1){
    if(!this.ok||volume<=.02)return;const t=this.ctx.currentTime,d=.6+Math.random()*.7,f=(70+Math.random()*50)*pitch;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),lfo=this.ctx.createOscillator(),lg=this.ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(f,t);o.frequency.linearRampToValueAtTime(f*(.7+Math.random()*.5),t+d);
    lfo.frequency.value=9+Math.random()*12;lg.gain.value=f*.25;lfo.connect(lg);lg.connect(o.frequency);
    const mix=this.ctx.createGain();for(const [ff,q] of [[500+Math.random()*300,4],[1100+Math.random()*500,6]]){const b=this.ctx.createBiquadFilter();b.type='bandpass';b.frequency.value=ff;b.Q.value=q;o.connect(b);b.connect(mix);}
    mix.connect(g);g.connect(this.out);this.env(g,t,.08,.5*volume,d);o.start(t);lfo.start(t);o.stop(t+d+.1);lfo.stop(t+d+.1);
    this.noiseHit({t,type:'bandpass',f:900,q:1,vol:.12*volume,a:.05,d});this.log('growl');
  }
  play(kind,volume=1){
    if(!this.ok)return;this.log(kind);const t=this.ctx.currentTime;
    switch(kind){
      case 'hit':this.noiseHit({f:1800,vol:.25*volume,d:.05});break;
      case 'headshot':this.noiseHit({type:'bandpass',f:2600,q:2,vol:.4*volume,d:.05});this.tone({type:'triangle',f:900,f2:500,vol:.14*volume,d:.07});break;
      case 'kill':this.noiseHit({f:600,vol:.35*volume,d:.15});break;
      case 'killconfirm':this.tone({type:'triangle',f:780,vol:.16*volume,d:.07});this.tone({t:t+.06,type:'triangle',f:1170,vol:.18*volume,d:.14});break;
      case 'hurt':this.tone({type:'sawtooth',f:180,f2:90,vol:.25,d:.2});this.noiseHit({f:500,vol:.35,d:.2});break;
      case 'scream':this.tone({type:'sawtooth',f:520,f2:160,vol:.2*volume,a:.03,d:.5});this.noiseHit({type:'bandpass',f:1300,q:3,vol:.2*volume,a:.03,d:.45});break;
      case 'moan':this.tone({type:'sawtooth',f:150,f2:95,vol:.18*volume,a:.15,d:.9});this.noiseHit({type:'bandpass',f:600,q:2,vol:.1*volume,a:.15,d:.8});break;
      case 'bark':this.tone({type:'sawtooth',f:320,f2:140,vol:.3*volume,a:.01,d:.12});this.noiseHit({type:'bandpass',f:900,q:2,vol:.3*volume,d:.1});break;
      case 'howl':this.tone({type:'sawtooth',f:240,f2:520,vol:.14*volume,a:.4,d:.5});this.tone({t:t+.8,type:'sawtooth',f:520,f2:300,vol:.14*volume,a:.1,d:1.1});break;
      case 'gib':this.noiseHit({f:900,f2:200,vol:.5*volume,d:.2});this.tone({f:90,f2:50,vol:.3*volume,d:.15});break;
      case 'board':this.noiseHit({type:'bandpass',f:900,q:2,vol:.6*volume,d:.12});this.noiseHit({t:t+.05,f:400,vol:.3*volume,d:.2});break;
      case 'repair':this.noiseHit({type:'bandpass',f:1500,q:3,vol:.5,d:.05});this.tone({f:300,f2:200,vol:.25,d:.06});break;
      case 'buy':this.tone({type:'triangle',f:1318,vol:.25,d:.12});this.tone({t:t+.09,type:'triangle',f:1760,vol:.25,d:.25});break;
      case 'deny':this.tone({type:'square',f:140,vol:.15,d:.25});break;
      case 'click':this.noiseHit({type:'bandpass',f:3200,q:5,vol:.2,d:.03});break;
      case 'door':this.noiseHit({f:300,f2:80,vol:.6,a:.05,d:.6,rate:.5});this.tone({f:60,f2:35,vol:.4,d:.5});break;
      case 'explosion':this.noiseHit({f:1200,f2:90,vol:.9*volume,a:.005,d:1.1});this.tone({f:70,f2:28,vol:.8*volume,d:.8});break;
      case 'thunder':this.noiseHit({f:500,f2:60,vol:.8*volume,a:.02,d:2.2,rate:.6});this.tone({f:50,f2:25,vol:.5*volume,d:1.4});break;
      case 'zap':for(let i=0;i<5;i++)this.noiseHit({t:t+i*.05,type:'bandpass',f:2000+Math.random()*3000,q:6,vol:.3*volume,d:.05});this.tone({type:'sawtooth',f:55,vol:.2*volume,d:.4});break;
      case 'teleport':this.tone({type:'sine',f:200,f2:2400,vol:.25,a:.3,d:.5});this.noiseHit({t:t+.7,f:3000,f2:200,vol:.5,d:.5});break;
      case 'flash':this.noiseHit({type:'highpass',f:3000,vol:.7*volume,d:.25});this.tone({type:'sine',f:4200,vol:.12*volume,a:.01,d:2.4});break;
      case 'hiss':this.noiseHit({type:'bandpass',f:3200,q:.8,vol:.3*volume,a:.1,d:1.6});break;
      case 'throw':this.noiseHit({type:'bandpass',f:500,f2:1800,q:1.5,vol:.25,a:.05,d:.2});break;
      case 'pin':this.noiseHit({type:'bandpass',f:3600,q:7,vol:.25,d:.03});this.noiseHit({t:t+.08,type:'bandpass',f:2400,q:5,vol:.2,d:.04});break;
      case 'bounce':this.noiseHit({type:'bandpass',f:1900,q:4,vol:.3*volume,d:.05});break;
      case 'shell':this.tone({type:'triangle',f:3200+Math.random()*900,vol:.05*volume,d:.07});break;
      case 'ricochet':this.tone({type:'sine',f:2600,f2:900,vol:.1*volume,d:.25});break;
      case 'slide':this.noiseHit({type:'bandpass',f:700,f2:300,q:.8,vol:.3,a:.03,d:.5});break;
      case 'land':this.noiseHit({f:300,vol:.4*volume,d:.12});this.tone({f:80,f2:45,vol:.3*volume,d:.1});break;
      case 'mantle':this.noiseHit({type:'bandpass',f:500,q:1,vol:.3,a:.04,d:.25});break;
      case 'power':for(let i=0;i<4;i++)this.tone({t:t+i*.12,type:'sawtooth',f:55*(i+1),vol:.18,d:1.6});this.noiseHit({type:'bandpass',f:120,q:3,vol:.5,a:.3,d:2});break;
      case 'powerup_spawn':for(let i=0;i<5;i++)this.tone({t:t+i*.07,type:'sine',f:880*Math.pow(1.26,i),vol:.12,d:.4});break;
      case 'powerup_grab':for(let i=0;i<3;i++)this.tone({t:t+i*.05,type:'triangle',f:660*Math.pow(1.5,i),vol:.2,d:.5});break;
      case 'medal':this.tone({type:'triangle',f:988,vol:.14,d:.09});this.tone({t:t+.08,type:'triangle',f:1319,vol:.16,d:.2});break;
      case 'levelup':[0,4,7,12,16].forEach((n,i)=>this.tone({t:t+i*.09,type:'triangle',f:523*Math.pow(2,n/12),vol:.2,d:.5}));break;
      case 'beep':this.tone({type:'square',f:1200,vol:.1*volume,d:.06});break;
      case 'countdown':this.tone({type:'sine',f:660,vol:.2,d:.12});break;
      case 'go':this.tone({type:'sine',f:990,vol:.25,d:.5});this.tone({type:'sine',f:1320,vol:.15,d:.5});break;
      case 'capture':[0,7,12].forEach((n,i)=>this.tone({t:t+i*.1,type:'sawtooth',f:330*Math.pow(2,n/12),vol:.12,d:.3}));break;
      case 'lost':[0,-3,-7].forEach((n,i)=>this.tone({t:t+i*.12,type:'sawtooth',f:330*Math.pow(2,n/12),vol:.12,d:.35}));break;
      case 'plant':for(let i=0;i<3;i++)this.tone({t:t+i*.12,type:'square',f:880,vol:.12,d:.07});break;
      case 'pickup':this.tone({type:'triangle',f:700,f2:1400,vol:.2,d:.12});break;
      case 'chat':this.tone({type:'sine',f:1500,vol:.07,d:.06});break;
      case 'round':this.sting([0,-2,3,-5],.32,0.0);break;
      case 'round_end':this.sting([0,3,7,12],.24,.0);break;
      case 'win':this.sting([0,4,7,12,16],.2);break;
      case 'lose':this.sting([0,-1,-5,-8],.34);break;
      case 'hounds':this.sting([0,1,0,1,-12],.18,0);this.growl(1);break;
      case 'crate':{const scale=[0,3,5,7,10,12,15];for(let i=0;i<14;i++)this.tone({t:t+i*.17,type:'sine',f:660*Math.pow(2,scale[(i*5+3)%7]/12),vol:.12,d:.5});break;}
      case 'crate_gone':this.tone({type:'sine',f:440,f2:110,vol:.2,d:1.2});break;
      case 'refinery':for(let i=0;i<12;i++)this.noiseHit({t:t+i*.3,type:'bandpass',f:300+i*40,q:3,vol:.4,d:.2});this.tone({type:'sawtooth',f:55,f2:110,vol:.15,a:.5,d:3.5});break;
      case 'drink':this.noiseHit({type:'bandpass',f:500,q:3,vol:.3,a:.2,d:.6});this.tone({t:t+.8,type:'sine',f:180,f2:90,vol:.2,d:.25});break;
      case 'trap':this.tone({type:'square',f:60,vol:.2,d:.6});break;
      default:this.tone({f:440,vol:.1,d:.1});
    }
  }
  perk(id){if(!this.ok)return;const m=MOTIFS[id]??[0,4,7];const t=this.ctx.currentTime;m.forEach((n,i)=>{this.tone({t:t+.3+i*.16,type:'triangle',f:392*Math.pow(2,n/12),vol:.16,d:.3});this.tone({t:t+.3+i*.16,type:'sine',f:196*Math.pow(2,n/12),vol:.1,d:.3});});}
  sting(notes,step=.3){const t=this.ctx.currentTime;notes.forEach((n,i)=>{const f=110*Math.pow(2,n/12);for(const det of [-8,0,7])this.tone({t:t+i*step,type:'sawtooth',f,vol:.09,a:.04,d:step*1.6,dest:this.music,detune:det});this.tone({t:t+i*step,type:'sine',f:f/2,vol:.25,a:.02,d:step*1.8,dest:this.music});});}
  // ----- music -----
  setMusic(name){this.wantTrack=TRACKS[name]?name:null;}
  sequence(){
    if(!this.ok)return;const c=this.ctx;
    if(this.wantTrack!==this.track){this.track=this.wantTrack;this.step16=0;this.nextStep=c.currentTime+.05;}
    const tr=TRACKS[this.track];if(!tr)return;const stepLen=60/tr.bpm/4,old=this.scale;this.scale=tr.gain;
    while(this.nextStep<c.currentTime+.2){
      const t=this.nextStep,i=this.step16%16,bar=Math.floor(this.step16/16),hz=n=>110*Math.pow(2,n/12),dest=this.music;
      if(tr.bass&&tr.bass[i]!==null&&tr.bass[i]!==undefined){this.tone({t,type:'sawtooth',f:hz(tr.bass[i])/2,vol:.3,a:.01,d:stepLen*1.7,dest});this.tone({t,type:'sine',f:hz(tr.bass[i])/4,vol:.4,a:.01,d:stepLen*1.9,dest});}
      if(tr.pad&&i===0){const chord=tr.pad[bar%tr.pad.length];for(const n of chord)for(const det of [-7,6])this.tone({t,type:'sawtooth',f:hz(n),vol:.045,a:stepLen*3,d:stepLen*13,dest,detune:det});}
      if(tr.lead&&tr.lead[i]!==null&&tr.lead[i]!==undefined)this.tone({t,type:tr.leadType??'triangle',f:hz(tr.lead[i])*(tr.leadOct??1),vol:.1,a:.01,d:stepLen*5,dest});
      if(tr.kick?.[i]){this.tone({t,f:120,f2:42,vol:.55,a:.002,d:.16,dest});}
      if(tr.snare?.[i])this.noiseHit({t,type:'bandpass',f:1800,q:.8,vol:.3,d:.12,dest});
      if(tr.hat?.[i])this.noiseHit({t,type:'highpass',f:7000,vol:.1,d:.03,dest});
      this.nextStep+=stepLen;this.step16++;
    }
    this.scale=old;
  }
  startAmbience(){
    const c=this.ctx,g=c.createGain();g.gain.value=.12;g.connect(this.music);this.ambient=g;
    for(const [f,det] of [[55,0],[82.4,-6],[110,5]]){const o=c.createOscillator();o.type='sine';o.frequency.value=f;o.detune.value=det;const og=c.createGain();og.gain.value=.25;const l=c.createOscillator(),lg=c.createGain();l.frequency.value=.05+Math.random()*.1;lg.gain.value=.2;l.connect(lg);lg.connect(og.gain);o.connect(og);og.connect(g);o.start();l.start();}
    const s=c.createBufferSource();s.buffer=this.noise;s.loop=true;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=300;const ng=c.createGain();ng.gain.value=.15;s.connect(f);f.connect(ng);ng.connect(g);s.start();
    // distant music-box phrase every so often
    this.ambientTimer=setInterval(()=>{if(!this.ok||this.track||Math.random()<.5)return;const t=c.currentTime,sc=[0,2,3,7,8];for(let i=0;i<6;i++)this.tone({t:t+i*.42,type:'sine',f:523*Math.pow(2,sc[Math.floor(Math.random()*5)]/12),vol:.035,d:1.2,dest:this.music});},9000);
  }
  // ----- announcer -----
  async loadVoice(key){try{const b=await fetch(`audio/voice/${key}.ogg`).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status));this.voices[key]=await this.ctx.decodeAudioData(b);}catch{}}
  voice(key,volume=.9){
    if(!this.ok)return false;const b=this.voices[key];if(!b)return false;
    const now=this.ctx.currentTime;
    if(now<this.speakUntil){if(this.voiceQueue.length<2&&!this.voiceQueue.some(q=>q.key===key)){this.voiceQueue.push({key,volume});clearTimeout(this.voiceTimer);this.voiceTimer=setTimeout(()=>{const q=this.voiceQueue.shift();if(q)this.voice(q.key,q.volume);},(this.speakUntil-now)*1000+60);}return true;}
    this.log('voice:'+key);
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1400;f.Q.value=.5;
    s.buffer=b;g.gain.value=volume;s.connect(f);f.connect(g);g.connect(this.voiceBus);s.start();this.speakUntil=now+b.duration;
    if(this.voiceQueue.length){clearTimeout(this.voiceTimer);this.voiceTimer=setTimeout(()=>{const q=this.voiceQueue.shift();if(q)this.voice(q.key,q.volume);},b.duration*1000+60);}
    return true;
  }
  snapshot(){return {enabled:this.enabled,state:this.ctx?.state??'idle',voices:Object.keys(this.voices).length,played:this.played.slice(),track:this.track};}
}
