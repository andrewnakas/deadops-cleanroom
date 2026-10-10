// Optional online services (room list, matchmaking, accounts, results, friends). The game stays peer-to-peer and
// keeps working without them: every call has a short timeout and resolves to null when the service is unreachable.
const KEY='graveshift.id';
const local=u=>/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u);
// The test override has to survive the page reloads that move between menu, lobby and match.
function sticky(u){try{if(u&&local(u))sessionStorage.setItem('graveshift.api',u);const s=sessionStorage.getItem('graveshift.api');return s&&local(s)?s:null;}catch{return u&&local(u)?u:null;}}
export class Backend {
  // `override` (the ?api= parameter) is honoured only for a local test server, so a crafted link cannot point the page elsewhere.
  constructor(base,override){this.base=String(sticky(override)??base??'').replace(/\/+$/,'');this.me=null;this.token=null;this.pending=null;}
  get on(){return !!this.base;}
  async call(method,path,body,ms=3000){
    if(!this.base)return null;
    try{
      const r=await fetch(this.base+'/v1/'+path,{method,keepalive:true,signal:AbortSignal.timeout(ms),headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:body?JSON.stringify(body):undefined});
      const j=await r.json();return r.ok?j:{...j,error:String(j?.error??'error'),status:r.status};
    }catch{return null;}
  }
  stored(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s&&s.base===this.base&&typeof s.token==='string'?s:null;}catch{return null;}}
  // Loads this browser's account; with `create` it makes one on first use. Anonymous: an id and a key, no email.
  signIn(name,create=true){
    if(!this.base)return Promise.resolve(null);
    // Calls queue behind one another: a background look-up that may not create must not answer for one that may.
    const before=this.pending;
    return this.pending=(async()=>{
      try{
        await before;if(this.me&&this.me.name===name)return this.me;
        const s=this.me?null:this.stored();
        if(s){this.token=s.token;const me=await this.call('GET','me');if(me&&!me.error){this.me=me;}else if(me?.status===401){this.token=null;try{localStorage.removeItem(KEY);}catch{}}else return null;}
        if(!this.me){
          if(!create)return null;
          const made=await this.call('POST','account',{name},5000);if(!made||made.error)return null;
          this.token=made.token;this.me=made;try{localStorage.setItem(KEY,JSON.stringify({base:this.base,token:made.token}));}catch{}
        }
        if(name&&this.me.name!==name){const r=await this.call('PUT','me',{name});if(r?.name)this.me.name=r.name;}
        return this.me;
      }catch{return null;}
    })();
  }
}
