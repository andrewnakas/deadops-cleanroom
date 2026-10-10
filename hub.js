// Online panel under the multiplayer menu: room browser, leaderboards, stats, friends and party.
// Everything shown comes from the backend, so every string is cleaned before it reaches innerHTML.
const PARTY='graveshift.party';
const code=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16),acct=v=>/^[A-Z0-9]{12}$/.test(String(v))?String(v):'';
export function createHub({api,el,tabs,mp,clean,signIn,room,idle,go,note}){
  let tab='',kind='rating',drawing=false;
  const flag=v=>{try{v?localStorage.setItem(PARTY,'1'):localStorage.removeItem(PARTY);}catch{}},flagged=()=>{try{return !!localStorage.getItem(PARTY);}catch{return false;}};
  const html={
    async rooms(){
      const r=await api.call('GET','rooms');if(!r||r.error)return null;
      return '<h4>OPEN ROOMS</h4>'+(r.rooms.some(x=>x.playlist!=='coop')?r.rooms.filter(x=>x.playlist!=='coop').map(x=>`<p><span>${code(x.code)} · ${clean(mp.maps[x.map]?.name??x.map)} · ${clean(mp.modes[x.mode]?.name??x.mode)} · ${+x.size|0} v ${+x.size|0} · ${+x.humans|0} playing · ${x.playlist==='ranked'?'RANKED':'CASUAL'}${x.started?' · in progress':''}</span>${x.free>0&&!(x.started&&x.playlist==='ranked')?`<button data-join="${code(x.code)}" data-map="${mp.maps[x.map]?x.map:''}" type="button">JOIN</button>`:'<i>FULL</i>'}</p>`).join(''):'<p>No open rooms right now · QUICK PLAY opens one</p>');
    },
    async board(){
      const r=await api.call('GET','board?kind='+kind);if(!r||r.error)return null;
      return `<h4>LEADERBOARD · SEASON ${(+r.season|0)+1}</h4><span class="hub-kinds">`+[['rating','RATING'],['kills','KILLS'],['wins','WINS']].map(([k,n])=>`<button data-kind="${k}" type="button"${k===kind?' class="on"':''}>${n}</button>`).join('')+'</span>'
        +(r.rows.length?r.rows.map(x=>`<p class="${x.you?'you':''}"><span>${+x.rank|0}. ${clean(x.name)}</span><span>${clean(x.division)}</span><b>${+x.value|0}</b></p>`).join(''):'<p>Nobody is on this board yet</p>')+'<p class="hub-note">Online matches only · results are confirmed by the players in each match</p>';
    },
    async stats(){
      const r=api.me&&await api.call('GET','stats/'+api.me.id);if(!r||r.error)return null;
      const line=(n,s)=>`<p><span>${n}</span><span>${+s.matches|0} matches · ${+s.wins|0} wins · ${+s.losses|0} losses</span><b>${+s.kills|0} / ${+s.deaths|0}</b></p>`;
      return `<h4>${clean(r.player.name)} · ${clean(r.player.division)} · RATING ${+r.player.rating|0} · ${+r.player.games|0} RANKED THIS SEASON</h4>`+line('This season',r.thisSeason)+line('All time',r.allTime)+r.modes.map(m=>line(clean(mp.modes[m.mode]?.name??m.mode),m)).join('')+'<p class="hub-note">Kills / deaths on the right · online matches only</p>';
    },
    async friends(){
      const s=await api.call('GET','social');if(!s||s.error)return null;
      flag(s.party);follow(s);
      const p=s.party,lead=p&&p.leader===s.me.id;
      return `<h4>YOUR FRIEND CODE <b>${code(s.me.friendCode)}</b></h4><p><input id="hub-code" maxlength="8" placeholder="FRIEND CODE" autocomplete="off"><button data-act="add" type="button">ADD FRIEND</button><i></i></p>`
        +(p?`<p><span>PARTY <b>${code(p.id)}</b> · ${p.members.map(m=>clean(m.name)+(m.id===p.leader?' ★':'')+(m.online?'':' (away)')).join(', ')}${lead?' · you lead: QUICK PLAY, HOST or JOIN takes everyone':' · you follow the leader'}</span><button data-act="pleave" type="button">LEAVE PARTY</button></p>`
          :'<p><button data-act="party" type="button">START A PARTY</button><input id="hub-party" maxlength="6" placeholder="PARTY CODE" autocomplete="off"><button data-act="pjoin" type="button">JOIN PARTY</button></p>')
        +s.invites.map(i=>`<p><span>${clean(i.from)} invited you to a party</span><button data-pjoin="${code(i.party)}" type="button">JOIN PARTY</button></p>`).join('')
        +s.friends.map(f=>`<p><span>${clean(f.name)} · ${f.state==='ok'?clean(f.division)+(f.online?' · online':' · offline'):f.state==='sent'?'request sent':'wants to be friends'}</span>`
          +(f.state==='asked'?`<button data-add="${acct(f.id)}" type="button">ACCEPT</button>`:'')+(f.room?`<button data-join="${code(f.room)}" type="button">JOIN</button>`:'')+(f.state==='ok'&&f.online&&p?`<button data-invite="${acct(f.id)}" type="button">INVITE</button>`:'')+`<button data-drop="${acct(f.id)}" type="button" title="Remove">✕</button></p>`).join('')
        +(s.recent.length?'<h4>RECENT PLAYERS</h4>'+s.recent.filter(r=>!s.friends.some(f=>f.id===r.id)).slice(0,8).map(r=>`<p><span>${clean(r.name)}</span><button data-add="${acct(r.id)}" type="button">ADD FRIEND</button></p>`).join(''):'');
    },
  };
  // A party member goes wherever the leader's room is, unless they are in the middle of a match.
  function follow(s){const p=s?.party;if(!p||!p.room||p.leader===s.me.id||!idle())return;const want=code(p.room);if(want&&want!==room()){note('Following the party to room '+want);go('?join='+want);}}
  async function draw(){
    if(!tab||drawing)return;drawing=true;
    try{
      if(!await signIn()){el.hidden=false;el.innerHTML='<p>Online services are not reachable right now · rooms by code still work</p>';return;}
      const keep=[...el.querySelectorAll('input')].map(i=>[i.id,i.value,document.activeElement===i]),body=await html[tab]();if(!tab)return;
      el.hidden=false;el.innerHTML=body??'<p>Could not load · try again</p>';for(const [id,v,f] of keep){const i=el.querySelector('#'+id);if(i){i.value=v;if(f)i.focus();}}
    }finally{drawing=false;}
  }
  function show(t){tab=tab===t?'':t;for(const b of tabs.querySelectorAll('button'))b.classList.toggle('on',b.dataset.hub===tab);if(!tab){el.hidden=true;el.innerHTML='';}else draw();}
  async function click(e){
    const b=e.target.closest('button');if(!b)return;const d=b.dataset,say=r=>{if(r?.error)note(r.error[0].toUpperCase()+r.error.slice(1));return draw();};
    if(d.kind){kind=d.kind;return draw();}
    if(d.join)return go('?join='+code(d.join)+(mp.maps[d.map]?'&map='+d.map:''));
    if(d.add)return say(await api.call('POST','friends',{id:d.add}));
    if(d.drop)return say(await api.call('POST','friends/remove',{id:d.drop}));
    if(d.invite){const r=await api.call('POST','party/invite',{id:d.invite});note(r?.ok?'Invite sent':r?.error??'Could not invite');return;}
    if(d.pjoin)return say(await api.call('POST','party/join',{id:d.pjoin}));
    if(d.act==='add'){const v=code(el.querySelector('#hub-code')?.value);if(v){el.querySelector('#hub-code').value='';return say(await api.call('POST','friends',{code:v}));}}
    if(d.act==='party')return say(await api.call('POST','party'));
    if(d.act==='pjoin'){const v=code(el.querySelector('#hub-party')?.value);if(v)return say(await api.call('POST','party/join',{id:v}));}
    if(d.act==='pleave'){flag(false);return say(await api.call('POST','party/leave'));}
  }
  el.addEventListener('click',click);tabs.addEventListener('click',e=>{const b=e.target.closest('button[data-hub]');if(b)show(b.dataset.hub);});
  // Rooms and friends refresh while open; a party is checked in the background so members follow with the panel closed.
  setInterval(async()=>{
    if(!idle()||document.hidden)return;
    if(tab==='rooms'||tab==='friends')return draw();
    if(flagged()&&await signIn(false)){const s=await api.call('GET','social');if(s&&!s.error){flag(s.party);follow(s);}}
  },4000);
  return {show,draw,tab:()=>tab};
}
