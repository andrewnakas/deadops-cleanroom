// Procedural sound (own work, CC0): every effect and the music are synthesised with
// WebAudio at runtime. Announcer lines are Piper TTS renders in audio/voice/*.ogg.
const MOTIFS={perk_wind:[0,4,7,12,7],perk_hide:[0,3,7,3,0,-5],perk_hands:[0,2,4,7,9,12],perk_trigger:[0,7,5,7,12,7]};
export class GameAudio {
  constructor(){this._enabled=true;this.ctx=null;this.played=[];this.voices={};this.voiceList=[];}
  async load(){try{const r=await fetch('audio/voice/manifest.json');if(r.ok)this.voiceList=await r.json();}catch{}}
  get enabled(){return this._enabled;}
  set enabled(v){this._enabled=v;if(this.master)this.master.gain.value=v?.5:0;}
  start(){
    if(!this.ctx){const C=globalThis.AudioContext??globalThis.webkitAudioContext;if(!C){this._enabled=false;return;}
      this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=this._enabled?.5:0;
      const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;this.master.connect(comp);comp.connect(this.ctx.destination);
      const len=this.ctx.sampleRate*2;this.noise=this.ctx.createBuffer(1,len,this.ctx.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
      this.music=this.ctx.createGain();this.music.gain.value=.22;this.music.connect(this.master);
      for(const key of this.voiceList)this.loadVoice(key);
    }
    this.ctx.resume();if(!this.ambient)this.startAmbience();
  }
  pause(){this.ctx?.suspend();}
  get ok(){return this._enabled&&this.ctx&&this.ctx.state==='running';}
  log(k){this.played.push(k);if(this.played.length>30)this.played.shift();}
  env(g,t,a,peak,decay){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+decay);}
  noiseHit({t=this.ctx.currentTime,type='lowpass',f=2000,f2=null,q=.7,vol=.5,a=.002,d=.2,dest=this.master,rate=1}){
    const s=this.ctx.createBufferSource(),fl=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;s.playbackRate.value=rate;
    fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+a+d);fl.Q.value=q;
    s.connect(fl);fl.connect(g);g.connect(dest);this.env(g,t,a,vol,d);s.start(t,Math.random()*1.5);s.stop(t+a+d+.05);
  }
  tone({t=this.ctx.currentTime,type='sine',f=440,f2=null,vol=.3,a=.005,d=.3,dest=this.master,detune=0}){
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+a+d);o.detune.value=detune;
    o.connect(g);g.connect(dest);this.env(g,t,a,vol,d);o.start(t);o.stop(t+a+d+.05);
  }
  shot(def){
    if(!this.ok)return;this.log('shot:'+def.class);const c=def.class;
    if(c==='energy'){this.tone({type:'square',f:1400,f2:180,vol:.18,d:.22});this.tone({type:'sawtooth',f:700,f2:90,vol:.12,d:.3,detune:12});this.noiseHit({type:'bandpass',f:3000,q:2,vol:.15,d:.1});return;}
    if(c==='launcher'){this.noiseHit({f:900,f2:200,vol:.6,d:.35});this.tone({f:90,f2:40,vol:.5,d:.3});return;}
    const big=c==='shotgun'||c==='sniper'||c==='magnum';
    this.noiseHit({type:'highpass',f:big?900:1600,vol:big?.55:.4,d:big?.08:.05});
    this.noiseHit({f:big?1400:2600,f2:big?160:400,vol:big?.75:.55,d:big?.42:c==='pistol'?.18:.14});
    this.tone({f:big?95:140,f2:40,vol:big?.6:.38,d:big?.22:.12});
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
  growl(volume=1){
    if(!this.ok||volume<=.02)return;const t=this.ctx.currentTime,d=.6+Math.random()*.7,f=70+Math.random()*50;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),lfo=this.ctx.createOscillator(),lg=this.ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(f,t);o.frequency.linearRampToValueAtTime(f*(.7+Math.random()*.5),t+d);
    lfo.frequency.value=9+Math.random()*12;lg.gain.value=f*.25;lfo.connect(lg);lg.connect(o.frequency);
    const mix=this.ctx.createGain();for(const [ff,q] of [[500+Math.random()*300,4],[1100+Math.random()*500,6]]){const b=this.ctx.createBiquadFilter();b.type='bandpass';b.frequency.value=ff;b.Q.value=q;o.connect(b);b.connect(mix);}
    mix.connect(g);g.connect(this.master);this.env(g,t,.08,.5*volume,d);o.start(t);lfo.start(t);o.stop(t+d+.1);lfo.stop(t+d+.1);
    this.noiseHit({t,type:'bandpass',f:900,q:1,vol:.12*volume,a:.05,d});this.log('growl');
  }
  play(kind,volume=1){
    if(!this.ok)return;this.log(kind);const t=this.ctx.currentTime;
    switch(kind){
      case 'hit':this.noiseHit({f:1800,vol:.25*volume,d:.05});break;
      case 'kill':this.noiseHit({f:600,vol:.35*volume,d:.15});break;
      case 'hurt':this.tone({type:'sawtooth',f:180,f2:90,vol:.25,d:.2});this.noiseHit({f:500,vol:.35,d:.2});break;
      case 'board':this.noiseHit({type:'bandpass',f:900,q:2,vol:.6*volume,d:.12});this.noiseHit({t:t+.05,f:400,vol:.3*volume,d:.2});break;
      case 'repair':this.noiseHit({type:'bandpass',f:1500,q:3,vol:.5,d:.05});this.tone({f:300,f2:200,vol:.25,d:.06});break;
      case 'buy':this.tone({type:'triangle',f:1318,vol:.25,d:.12});this.tone({t:t+.09,type:'triangle',f:1760,vol:.25,d:.25});break;
      case 'deny':this.tone({type:'square',f:140,vol:.15,d:.25});break;
      case 'door':this.noiseHit({f:300,f2:80,vol:.6,a:.05,d:.6,rate:.5});this.tone({f:60,f2:35,vol:.4,d:.5});break;
      case 'explosion':this.noiseHit({f:1200,f2:90,vol:.9*volume,a:.005,d:1.1});this.tone({f:70,f2:28,vol:.8*volume,d:.8});break;
      case 'power':for(let i=0;i<4;i++)this.tone({t:t+i*.12,type:'sawtooth',f:55*(i+1),vol:.18,d:1.6});this.noiseHit({type:'bandpass',f:120,q:3,vol:.5,a:.3,d:2});break;
      case 'powerup_spawn':for(let i=0;i<5;i++)this.tone({t:t+i*.07,type:'sine',f:880*Math.pow(1.26,i),vol:.12,d:.4});break;
      case 'powerup_grab':for(let i=0;i<3;i++)this.tone({t:t+i*.05,type:'triangle',f:660*Math.pow(1.5,i),vol:.2,d:.5});break;
      case 'round':this.sting([0,-2,3,-5],.32,0.0);break;
      case 'round_end':this.sting([0,3,7,12],.24,.0);break;
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
  startAmbience(){
    const c=this.ctx,g=c.createGain();g.gain.value=.12;g.connect(this.music);this.ambient=g;
    for(const [f,det] of [[55,0],[82.4,-6],[110,5]]){const o=c.createOscillator();o.type='sine';o.frequency.value=f;o.detune.value=det;const og=c.createGain();og.gain.value=.25;const l=c.createOscillator(),lg=c.createGain();l.frequency.value=.05+Math.random()*.1;lg.gain.value=.2;l.connect(lg);lg.connect(og.gain);o.connect(og);og.connect(g);o.start();l.start();}
    const s=c.createBufferSource();s.buffer=this.noise;s.loop=true;const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=300;const ng=c.createGain();ng.gain.value=.15;s.connect(f);f.connect(ng);ng.connect(g);s.start();
    // distant music-box phrase every so often
    this.ambientTimer=setInterval(()=>{if(!this.ok||Math.random()<.5)return;const t=c.currentTime,sc=[0,2,3,7,8];for(let i=0;i<6;i++)this.tone({t:t+i*.42,type:'sine',f:523*Math.pow(2,sc[Math.floor(Math.random()*5)]/12),vol:.035,d:1.2,dest:this.music});},9000);
  }
  async loadVoice(key){try{const b=await fetch(`audio/voice/${key}.ogg`).then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status));this.voices[key]=await this.ctx.decodeAudioData(b);}catch{}}
  voice(key,volume=.9){
    if(!this.ok)return;const b=this.voices[key];if(!b)return;this.log('voice:'+key);
    const s=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1400;f.Q.value=.5;
    s.buffer=b;g.gain.value=volume;s.connect(f);f.connect(g);g.connect(this.master);s.start();
  }
  snapshot(){return {enabled:this.enabled,state:this.ctx?.state??'idle',voices:Object.keys(this.voices).length,played:this.played.slice()};}
}
