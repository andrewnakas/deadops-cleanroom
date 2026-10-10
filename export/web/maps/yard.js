import { MapKit } from '../map-kit.js';

// "Cinder Yard": an original three-lane freight yard arena (inches, Y up).
// West = Team Dawn spawn, East = Team Dusk spawn. Lanes: north loading dock, the warehouse, south container rows.
export function buildYard(){
  const k=new MapKit(),W=1500,D=900;
  // ground: concrete apron with a service road through the warehouse
  k.box(-W-12,-12,-D-12,W+12,0,D+12,'concrete');
  k.box(-W,0,-70,W,1,70,'asphalt',{uvScale:200});
  // perimeter: brick walls, plus invisible clip above
  for(const [a,b] of [[[-W-12,0,-D-12],[W+12,160,-D]],[[-W-12,0,D],[W+12,160,D+12]],[[-W-12,0,-D],[-W,160,D]],[[W,0,-D],[W+12,160,D]]])k.box(...a,...b,'bricks');
  for(const [a,b] of [[[-W-12,160,-D-12],[W+12,600,-D]],[[-W-12,160,D],[W+12,600,D+12]],[[-W-12,160,-D],[-W,600,D]],[[W,160,-D],[W+12,600,D]]])k.box(...a,...b,'bricks',{invisible:true,nonav:true});
  // centre: a warehouse the road runs through; wide end doors, side doors and windows
  const wx=420,wz=260,wh=180;
  k.box(-wx,0,-wz,wx,4,wz,'concrete');k.box(-wx-16,wh,-wz-16,wx+16,wh+14,wz+16,'roof',{ceiling:true});
  for(const z of [-wz,wz])k.wallX(z,-wx,wx,0,wh,'siding_b',[[-60,60,0,110],[-300,-200,55,120],[200,300,55,120]]);
  for(const x of [-wx,wx])k.wallZ(x,-wz,wz,0,wh,'siding_b',[[-130,130,0,140]]);
  k.box(-230,4,-170,-120,70,-70,'planks');k.box(120,4,70,230,70,170,'planks');
  k.box(-330,4,90,-250,44,200,'paintedwood');k.box(250,4,-200,330,44,-90,'paintedwood');
  k.box(-45,4,-35,45,46,35,'bricks');
  // north: a raised loading dock with a ramp at each end and crates on top
  k.box(-500,0,-830,500,40,-630,'concrete');
  k.ramp(-640,-810,-500,-650,0,0,40,'+x','concrete');k.ramp(500,-810,640,-650,0,40,0,'+x','concrete');
  k.box(-90,40,-800,90,100,-720,'planks');k.box(-380,40,-700,-300,84,-640,'paintedwood');k.box(300,40,-700,380,84,-640,'paintedwood');
  k.box(-960,0,-860,-840,110,-760,'siding');k.box(840,0,-860,960,110,-760,'siding');
  // south: two staggered rows of freight containers
  const box=(x,z,mat)=>k.box(x-120,0,z-50,x+120,100,z+50,mat);
  box(-900,530,'carpaint');box(-300,530,'carpaint_b');box(300,530,'carpaint');box(900,530,'carpaint_b');
  box(-600,750,'carpaint_b');box(0,750,'carpaint');box(600,750,'carpaint_b');
  // flanks: parked trucks, low walls and yard fences with gaps
  const truck=(x,z,mat)=>{k.box(x-100,0,z-40,x+100,56,z+40,mat);k.box(x-100,56,z-36,x-30,84,z+36,'glass');};
  truck(-800,-210,'carpaint');truck(800,210,'carpaint_b');
  k.box(-650,0,110,-626,52,320,'bricks');k.box(626,0,-320,650,52,-110,'bricks');
  k.wallX(-430,-1150,-700,0,72,'planks',[[-960,-880,0,72]],6);k.wallX(-430,700,1150,0,72,'planks',[[880,960,0,72]],6);
  k.wallX(400,-1150,-700,0,72,'planks',[[-960,-880,0,72]],6);k.wallX(400,700,1150,0,72,'planks',[[880,960,0,72]],6);
  // spawn yards: a gatehouse and a skip for cover
  k.box(-1450,0,-120,-1250,120,120,'siding');k.box(1250,0,-120,1450,120,120,'siding');
  k.box(-1180,0,250,-1070,60,340,'carpaint_b');k.box(1070,0,-340,1180,60,-250,'carpaint');
  // lights: sodium lamps over the yard, work lights in the warehouse
  k.light([0,150,0],0xffd9a0,1.6,900);k.light([-260,150,0],0xffd9a0,1.2,600);k.light([260,150,0],0xffd9a0,1.2,600);k.light([-900,320,-600],0xffb070,.9,1200);k.light([900,320,600],0xffb070,.9,1200);
  k.light([0,300,-720],0xffe0b0,.8,900);k.light([0,300,640],0xb0c8ff,.8,1100);k.light([-900,300,600],0xb0c8ff,.6,900);k.light([900,300,-600],0xb0c8ff,.6,900);
  // spawns: two teams, spread along the yard
  for(const [i,z] of [-700,-520,-340,-180,180,340,520,700].entries()){k.entity({type:'spawn',team:0,position:[-1350+(i%2)*80,0,z],yaw:-Math.PI/2});k.entity({type:'spawn',team:1,position:[1350-(i%2)*80,0,z],yaw:Math.PI/2});}
  // lane waypoints for bots (lane, x order west→east)
  const lanes={north:[[-1100,-650],[-760,-600],[-400,-540],[0,-540],[400,-540],[760,-600],[1100,-650]],
    mid:[[-1100,-200],[-760,0],[-500,0],[0,-110],[500,0],[760,0],[1100,200]],
    south:[[-1100,650],[-760,640],[-450,640],[0,640],[450,640],[760,640],[1100,650]]};
  for(const [lane,pts] of Object.entries(lanes))pts.forEach((p,i)=>k.entity({type:'waypoint',lane,index:i,position:[p[0],0,p[1]]}));
  return {kit:k,links:[],start:[],sky:0x3a3440};
}
