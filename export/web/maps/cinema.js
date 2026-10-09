import { MapKit } from '../map-kit.js';

// "Starlight Picturehouse": an original abandoned-cinema layout (inches, Y up, -Z = screen end).
//   Lobby (start) -> Stair hall -> Balcony + Projection booth (power)
//   Lobby -> Auditorium (seats, stage, refinery) -> Dressing rooms / Back alley
export function buildCinema(){
  const k=new MapKit(),H=12;
  const window_=(id,zone,center,normal,sill=30,top=100,width=100)=>k.entity({type:'barrier',id,zone,center,normal,sill,top,width});

  // ---------- Lobby: x[-400,400] z[0,600], ceiling 150 ----------
  k.box(-412,-12,0,412,0,612,'tiles');
  k.box(-412,148,-6,412,160,612,'plaster',{ceiling:true});
  k.wallX(606,-412,412,0,150,'wallpaper',[[-250,-150,30,100],[150,250,30,100]]);
  k.wallZ(-406,0,612,0,150,'wallpaper',[[250,350,30,100]]);
  k.wallZ(406,0,612,0,150,'wallpaper',[[260,370,0,110]]);
  window_('lobby_w','lobby',[-406,0,300],[-1,0,0]);
  window_('lobby_s1','lobby',[-200,0,606],[0,0,1]);
  window_('lobby_s2','lobby',[200,0,606],[0,0,1]);
  // ticket booth + concession counter
  k.box(-330,0,24,-170,44,84,'paintedwood');k.box(-330,44,24,-170,96,30,'paintedwood',{nocollide:true,nonav:true});
  k.box(-330,96,24,-170,104,84,'paintedwood');
  k.box(140,0,24,340,42,84,'paintedwood');k.box(140,42,24,340,46,90,'metal');
  k.box(-40,0,560,40,30,600,'velvet',{tag:'bench'});

  // ---------- Auditorium: x[-600,700] z[-1400,0], ceiling 400 ----------
  k.box(-612,-12,-1412,712,0,0,'carpet');
  k.box(-612,400,-1412,712,412,0,'plaster',{ceiling:true});
  k.wallX(0,-612,712,0,400,'wallpaper',[[-80,80,0,110],[-60,60,160,250],[580,700,160,260]]);
  k.wallX(-1406,-612,712,0,400,'bricks');
  k.wallZ(-606,-1412,6,0,400,'wallpaper',[[-800,-700,30,100],[-1300,-1200,40,150]]);
  k.wallZ(706,-1412,6,0,400,'wallpaper',[[-450,-350,30,100],[-900,-800,0,110]]);
  window_('aud_w','auditorium',[-606,0,-750],[-1,0,0]);
  window_('aud_e','auditorium',[706,0,-400],[1,0,0]);
  // stage platform + side steps
  k.box(-500,0,-1400,600,40,-1150,'woodfloor');
  k.ramp(-600,-1150,-500,-1050,0,40,0,'+z','woodfloor');k.box(-600,0,-1400,-500,40,-1150,'woodfloor');
  k.ramp(600,-1150,700,-1050,0,40,0,'+z','woodfloor');k.box(600,0,-1400,700,40,-1150,'woodfloor');
  // screen frame + curtains
  k.box(-470,80,-1400,570,90,-1392,'metal',{nocollide:true,nonav:true});k.box(-470,330,-1400,570,340,-1392,'metal',{nocollide:true,nonav:true});
  k.box(-560,40,-1360,-470,390,-1300,'velvet');k.box(570,40,-1360,660,390,-1300,'velvet');
  k.box(-600,350,-1300,700,400,-1280,'velvet',{nocollide:true,nonav:true});
  // seating: rows of seats, centre and side aisles
  for(let z=-1000;z<=-560;z+=74){for(const [x0,x1] of [[-450,-90],[110,470]]){
    k.box(x0,0,z,x1,18,z+28,'velvet');k.box(x0,18,z+22,x1,38,z+28,'velvet');
  }}
  // balcony slab + railing + supports
  k.box(-612,150,-300,712,160,0,'woodfloor');
  k.wallX(-300,-480,712,160,200,'paintedwood',[],8);
  for(const x of [-300,0,300,600])k.box(x-10,0,-310,x+10,150,-290,'paintedwood');
  // balcony stairs (west): from balcony z=-300 down to z=-620
  k.ramp(-600,-620,-480,-300,0,0,160,'+z','carpet');
  k.wallZ(-474,-620,-300,0,200,'paintedwood',[],8);
  // ---------- Projection booth: above the lobby, x[-150,150] z[0,200] ----------
  k.wallZ(-150,0,200,160,290,'plaster');k.wallZ(150,0,200,160,290,'plaster');k.wallX(200,-162,162,160,290,'plaster');
  k.box(-162,280,0,162,292,212,'plaster',{ceiling:true});
  k.box(-150,150,0,150,160,200,'woodfloor');
  k.box(-140,160,120,-70,200,190,'metal');k.box(70,160,120,140,200,190,'metal');
  // ---------- Stair hall: x[400,700] z[0,400] ----------
  k.box(400,-12,0,712,0,412,'concrete');
  k.box(400,300,-6,712,312,412,'plaster',{ceiling:true});
  k.wallX(406,400,712,0,300,'bricks',[[420,520,30,100]]);
  k.wallZ(706,0,412,0,300,'bricks');
  window_('stairs_s','stairs',[470,0,406],[0,0,1]);
  k.ramp(560,60,700,330,0,160,0,'+z','concrete');
  k.box(560,0,0,700,160,60,'concrete');
  k.wallZ(554,60,330,0,200,'metal',[],6);
  // ---------- Dressing rooms: x[-1000,-600] z[-1400,-1000], floor at 40 ----------
  k.box(-1012,-12,-1412,-600,40,-988,'woodfloor');
  k.box(-1012,260,-1412,-600,272,-988,'plaster',{ceiling:true});
  k.wallZ(-1006,-1412,-988,40,260,'wallpaper',[[-1250,-1150,70,140]]);
  k.wallX(-1406,-1012,-600,40,260,'wallpaper',[[-850,-750,70,140]]);
  k.wallX(-994,-1012,-600,40,260,'wallpaper');
  window_('dress_w','dressing',[-1006,40,-1200],[-1,0,0]);
  window_('dress_n','dressing',[-800,40,-1406],[0,0,-1]);
  k.box(-990,40,-1060,-880,72,-1010,'paintedwood');k.box(-990,72,-1060,-984,140,-1010,'metal',{tag:'mirror'});
  k.box(-720,40,-1060,-620,72,-1010,'paintedwood');
  k.box(-700,40,-1380,-620,120,-1340,'paintedwood');
  // ---------- Back alley: x[700,1100] z[-1300,-500], open sky ----------
  k.box(700,-12,-1312,1112,0,-488,'asphalt');
  k.wallZ(1106,-1312,-488,0,300,'bricks',[[-1000,-900,30,100]]);
  k.wallX(-494,700,1112,0,300,'bricks',[[850,950,30,100]]);
  k.wallX(-1306,700,1112,0,300,'bricks',[[850,950,30,100]]);
  window_('alley_e','alley',[1106,0,-950],[1,0,0]);
  window_('alley_n','alley',[900,0,-1306],[0,0,-1]);
  window_('alley_s','alley',[900,0,-494],[0,0,1]);
  k.box(1010,0,-1260,1095,60,-1170,'metal');k.box(740,0,-1200,800,50,-1120,'planks');k.box(760,50,-1190,790,80,-1150,'planks');

  // ---------- Doors (dynamic blockers) ----------
  const door=(name,cost,min,max,triggers,flag)=>k.entity({type:'door',name,cost,flag:flag??name,min,max,triggers});
  door('lobby_aud',750,[-80,0,-8],[80,110,8],[[0,0,40],[0,0,-40]]);
  door('lobby_stairs',1000,[398,0,260],[414,110,370],[[370,0,315],[440,0,315]]);
  door('balcony_gate',750,[-600,160,-306],[-480,240,-292],[[-540,160,-270],[-540,140,-340]]);
  door('stage_dressing',1000,[-614,40,-1300],[-598,150,-1200],[[-560,40,-1250],[-640,40,-1250]]);
  door('aud_alley',1250,[698,0,-900],[714,110,-800],[[660,0,-850],[750,0,-850]]);

  // ---------- Zones (player volumes) and links ----------
  const zone=(name,boxes)=>k.entity({type:'zone',name,boxes});
  zone('booth',[[[-150,150,0],[150,300,200]]]);
  zone('balcony',[[[-612,150,-306],[712,320,0]]]);
  zone('stairs',[[[400,-20,0],[712,320,412]]]);
  zone('lobby',[[[-412,-20,0],[412,150,612]]]);
  zone('dressing',[[[-1012,0,-1412],[-600,280,-988]]]);
  zone('alley',[[[700,-20,-1312],[1112,320,-488]]]);
  zone('auditorium',[[[-612,-20,-1412],[712,420,0]]]);
  const links=[['lobby','stairs','lobby_stairs'],['stairs','balcony','always_on'],['balcony','booth','always_on'],['lobby','auditorium','lobby_aud'],['balcony','auditorium','balcony_gate'],['auditorium','dressing','stage_dressing'],['auditorium','alley','aud_alley']];

  // ---------- Machines and interactables ----------
  const ent=(type,props)=>k.entity({type,...props});
  ent('spawn',{position:[0,0,470],yaw:0});
  ent('perk',{perk:'perk_wind',position:[-370,0,140],yaw:Math.PI/2});
  ent('perk',{perk:'perk_hide',position:[520,40,-1370],yaw:0});
  ent('perk',{perk:'perk_hands',position:[-975,40,-1130],yaw:Math.PI/2});
  ent('perk',{perk:'perk_trigger',position:[1075,0,-700],yaw:-Math.PI/2});
  ent('refinery',{position:[0,40,-1330],yaw:0});
  ent('power',{position:[0,160,192],yaw:Math.PI});
  ent('crate',{id:'crate_lobby',position:[330,0,520],yaw:-Math.PI/2,start:true});
  ent('crate',{id:'crate_balcony',position:[300,160,-30],yaw:Math.PI});
  ent('crate',{id:'crate_under',position:[-540,0,-150],yaw:Math.PI/2});
  ent('crate',{id:'crate_dressing',position:[-800,40,-1030],yaw:Math.PI});
  ent('crate',{id:'crate_alley',position:[900,0,-1260],yaw:0});
  const wall=(weapon,position,yaw)=>ent('wallbuy',{weapon,position,yaw});
  wall('packrat',[-394,0,460],Math.PI/2);
  wall('brute',[394,0,180],-Math.PI/2);
  wall('ranger',[620,0,394],Math.PI);
  wall('kestrel',[-594,0,-450],Math.PI/2);
  wall('viper',[-300,160,-12],Math.PI);
  wall('riot',[-994,40,-1300],Math.PI/2);
  wall('halvard',[1094,0,-600],-Math.PI/2);
  ent('wallbuy',{weapon:'tripmine',position:[694,0,-1000],yaw:-Math.PI/2,equipment:true});
  ent('axe',{position:[1094,0,-820],yaw:-Math.PI/2});

  // ---------- Lights and dressing ----------
  k.light([0,118,300],0xffd9a0,1.0,700);k.light([0,380,-600],0xffcf96,1.2,1100);k.light([0,200,-1250],0xff8a6a,1.3,800);
  k.light([0,250,100],0xbfd8ff,.6,320);k.light([560,280,200],0xffe2b0,1.0,520);k.light([-800,240,-1200],0xffc890,1.2,520);k.light([900,290,-900],0x9bb7ff,1.0,800);
  k.entity({type:'screen',min:[-460,92,-1399],max:[560,328,-1398]});
  for(const [p,yaw,i] of [[[-394,75,220],Math.PI/2,0],[[394,75,480],-Math.PI/2,1],[[-60,75,594],Math.PI,2],[[60,75,594],Math.PI,3],[[-594,90,-950],Math.PI/2,4],[[-988,110,-1100],Math.PI/2,5]])k.entity({type:'poster',position:p,yaw,index:i});
  return {kit:k,links,start:['lobby'],outside:200};
}
