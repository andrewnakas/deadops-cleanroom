// Peer-to-peer rooms over WebRTC data channels (PeerJS cloud signalling; the page stays static).
// The host is the authority: it runs bots, hit detection, health, score and killstreaks.
// Clients own only their movement and send shot rays, which the host checks.
const PREFIX='graveshift-';
export class Net {
  constructor(){this.conns=new Map();this.peer=null;this.conn=null;this.status='offline';}
  set(status){this.status=status;this.onStatus?.(status);}
  open(id){return new Promise((resolve,reject)=>{const p=new globalThis.Peer(id,{debug:0});p.on('open',()=>resolve(p));p.on('error',e=>{this.set('network error: '+e.type);reject(e);});});}
  async host(code){
    this.peer=await this.open(PREFIX+code);this.set('hosting · waiting for players');
    this.peer.on('connection',c=>{c.on('open',()=>{this.conns.set(c,null);this.set(`hosting · ${this.conns.size} joined`);});c.on('data',m=>this.onData?.(c,m));
      c.on('close',()=>{this.onClose?.(c);this.conns.delete(c);this.set(`hosting · ${this.conns.size} joined`);});});
  }
  async join(code){
    this.peer?.destroy();this.peer=await this.open(undefined);const c=this.peer.connect(PREFIX+code,{reliable:true});
    await new Promise((resolve,reject)=>{c.on('open',resolve);c.on('error',reject);this.peer.on('error',()=>reject(new Error('room not found')));setTimeout(()=>reject(new Error('room not found')),20000);});
    this.conn=c;c.on('data',m=>this.onData?.(c,m));c.on('close',()=>this.set('disconnected from host'));this.set('connected');
  }
  send(m){if(this.conn?.open)this.conn.send(m);}
}
