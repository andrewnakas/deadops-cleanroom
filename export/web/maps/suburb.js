import { MapKit } from '../map-kit.js';

// "Maple Court": an original small three-lane suburban arena for team deathmatch (inches, Y up).
// West = Team Dawn spawn, East = Team Dusk spawn. Lanes: north backyards, the street, south gardens.
export function buildSuburb(){
  const k=new MapKit(),W=1500,D=900;
  // ground: lawn everywhere, asphalt street, concrete sidewalks/driveways
  k.box(-W-12,-12,-D-12,W+12,0,D+12,'grass');
  k.box(-W,0,-170,W,1,170,'asphalt',{uvScale:200});
  k.box(-W,0,-210,W,3,-170,'concrete');k.box(-W,0,170,W,3,210,'concrete');
  // perimeter: tall hedges / fences, plus invisible clip above
  for(const [a,b] of [[[-W-12,0,-D-12],[W+12,160,-D]],[[-W-12,0,D],[W+12,160,D+12]],[[-W-12,0,-D],[-W,160,D]],[[W,0,-D],[W+12,160,D]]])k.box(...a,...b,'hedge');
  for(const [a,b] of [[[-W-12,160,-D-12],[W+12,600,-D]],[[-W-12,160,D],[W+12,600,D+12]],[[-W-12,160,-D],[-W,600,D]],[[W,160,-D],[W+12,600,D]]])k.box(...a,...b,'hedge',{invisible:true,nonav:true});
  // houses: walk-through, doors front+back, open windows you can shoot through
  const house=(x0,z0,x1,z1,mat,frontZ)=>{
    const h=140,cx=(x0+x1)/2;
    k.box(x0,0,z0,x1,4,z1,'woodfloor');
    k.box(x0-16,h,z0-16,x1+16,h+14,z1+16,'roof',{ceiling:true});
    const win=(c)=>[c-40,c+40,55,110];
    k.wallX(z0,x0,x1,0,h,mat,[[cx-45,cx+45,0,96],win(x0+70),win(x1-70)]);
    k.wallX(z1,x0,x1,0,h,mat,[[cx-45,cx+45,0,96],win(x0+70),win(x1-70)]);
    k.wallZ(x0,z0,z1,0,h,mat,[[ (z0+z1)/2-40,(z0+z1)/2+40,55,110]]);
    k.wallZ(x1,z0,z1,0,h,mat,[[ (z0+z1)/2-40,(z0+z1)/2+40,55,110]]);
    // interior: a counter and a sofa for cover
    k.box(x0+30,4,z0+30,x0+110,40,z0+60,'paintedwood');k.box(x1-140,4,z1-60,x1-40,30,z1-30,'velvet');
    // front porch step
    k.box(cx-70,0,frontZ<0?z1:z0-40,cx+70,8,frontZ<0?z1+40:z0,'concrete');
  };
  house(-720,-470,-260,-230,'siding',-1);house(260,-470,720,-230,'siding_b',-1);
  house(-720,230,-260,470,'siding_b',1);house(260,230,720,470,'siding',1);
  // street: parked cars (body + cabin), cul-de-sac planter
  const car=(x,z,rot,mat)=>{const L=rot?60:180,Wd=rot?180:70;k.box(x-L/2,0,z-Wd/2,x+L/2,38,z+Wd/2,mat);k.box(x-L/2*.6,38,z-Wd/2*.85,x+L/2*.6,62,z+Wd/2*.85,'glass');};
  car(-900,-100,false,'carpaint');car(-380,95,false,'carpaint_b');car(420,-100,false,'carpaint_b');car(930,95,false,'carpaint');car(0,0,true,'carpaint');
  k.box(-140,0,-60,-60,30,60,'bricks');k.box(60,0,-60,140,30,60,'bricks');
  // north backyards: fences with gaps, sheds, a playhouse ramp up to a shed roof
  const fence=(x,z0,z1)=>k.wallZ(x,z0,z1,0,72,'planks',[],6);
  fence(-260,-D,-620);fence(-260,-520,-470);fence(260,-D,-700);fence(260,-600,-470);
  k.wallX(-560,-1150,-720,0,72,'planks',[[-1000,-920,0,72]],6);k.wallX(-560,720,1150,0,72,'planks',[[920,1000,0,72]],6);
  k.box(-110,0,-820,110,90,-700,'paintedwood');k.ramp(-110,-700,110,-580,0,90,0,'+z','planks');
  k.box(-1000,0,-860,-880,100,-740,'siding_b');k.box(880,0,-860,1000,100,-740,'siding_b');
  // south gardens: raised pool deck with ramps, garden walls, a greenhouse
  k.box(-260,0,560,260,40,800,'woodfloor');k.box(-200,40,610,200,42,750,'water',{nocollide:false});
  k.ramp(-400,600,-260,760,0,0,40,'+x','woodfloor');k.ramp(260,600,400,760,0,40,0,'+x','woodfloor');
  for(const x of [-1050,1050])k.box(x-60,0,600,x+60,110,720,'glass');
  k.wallX(560,-1150,-720,0,60,'bricks',[[-980,-900,0,60]],10);k.wallX(560,720,1150,0,60,'bricks',[[900,980,0,60]],10);
  // spawn yards: garage + truck cover
  k.box(-1450,0,-120,-1250,120,120,'siding');k.box(1250,0,-120,1450,120,120,'siding');
  k.box(-1180,0,380,-1060,60,520,'carpaint_b');k.box(1060,0,-520,1180,60,-380,'carpaint_b');
  // lights (dusk)
  k.light([0,400,0],0xffd2a0,1.2,2000);k.light([-900,300,-650],0xb0c8ff,.8,1100);k.light([900,300,650],0xb0c8ff,.8,1100);
  k.light([-490,120,-350],0xffe0b0,.6,400);k.light([490,120,-350],0xffe0b0,.6,400);k.light([-490,120,350],0xffe0b0,.6,400);k.light([490,120,350],0xffe0b0,.6,400);
  // spawns: two teams, spread along the yard
  for(const [i,z] of [-700,-520,-340,-180,180,340,520,700].entries()){k.entity({type:'spawn',team:0,position:[-1350+(i%2)*80,0,z],yaw:-Math.PI/2});k.entity({type:'spawn',team:1,position:[1350-(i%2)*80,0,z],yaw:Math.PI/2});}
  // lane waypoints for bots (lane, x order west→east)
  const lanes={north:[[-1100,-700],[-700,-650],[-400,-700],[0,-520],[400,-650],[700,-650],[1100,-700]],
    mid:[[-1100,-260],[-700,-120],[-300,0],[0,-150],[300,0],[700,120],[1100,260]],
    south:[[-1100,650],[-700,640],[-450,680],[0,880-60],[450,680],[700,640],[1100,650]]};
  for(const [lane,pts] of Object.entries(lanes))pts.forEach((p,i)=>k.entity({type:'waypoint',lane,index:i,position:[p[0],0,p[1]]}));
  return {kit:k,links:[],start:[],sky:0x2a3550};
}
