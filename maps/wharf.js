import { MapKit } from '../map-kit.js';

// "Gull Wharf": an original three-lane harbour arena (inches, Y up).
// West = Team Dawn spawn, East = Team Dusk spawn. Lanes: north boardwalk, the fish market, south boat sheds on the quay.
export function buildWharf(){
  const k=new MapKit(),W=1500,D=900;
  // ground: concrete quay with a plank market square; water beyond the south wall
  k.box(-W-12,-12,-D-12,W+12,0,D+12,'concrete');
  k.box(-520,0,-330,520,1,330,'woodfloor',{uvScale:160});
  k.box(-W,0,770,W,2,D,'water',{nonav:true});k.box(-W,0,750,W,34,770,'bricks');
  // perimeter: brick walls, plus invisible clip above
  for(const [a,b] of [[[-W-12,0,-D-12],[W+12,160,-D]],[[-W-12,0,D],[W+12,160,D+12]],[[-W-12,0,-D],[-W,160,D]],[[W,0,-D],[W+12,160,D]]])k.box(...a,...b,'bricks');
  for(const [a,b] of [[[-W-12,160,-D-12],[W+12,600,-D]],[[-W-12,160,D],[W+12,600,D+12]],[[-W-12,160,-D],[-W,600,D]],[[W,160,-D],[W+12,600,D]]])k.box(...a,...b,'bricks',{invisible:true,nonav:true});
  // north: a raised boardwalk with a ramp at each end, a kiosk and crates on top
  k.box(-700,0,-860,700,60,-670,'woodfloor');
  k.ramp(-880,-850,-700,-690,0,0,60,'+x','woodfloor');k.ramp(700,-850,880,-690,0,60,0,'+x','woodfloor');
  k.box(-70,60,-850,70,150,-770,'siding_b');k.box(-420,60,-740,-340,104,-680,'paintedwood');k.box(340,60,-740,420,104,-680,'paintedwood');
  k.box(-1080,0,-860,-960,100,-760,'siding');k.box(960,0,-860,1080,100,-760,'siding');
  // centre: four market stalls (counter, back wall, awning) around a brick well
  const stall=(x,z,s,mat)=>{k.box(x-90,0,z-22,x+90,44,z+22,'paintedwood');const lo=Math.min,hi=Math.max;k.box(x-90,0,lo(z+s*70,z+s*82),x+90,120,hi(z+s*70,z+s*82),mat);k.box(x-100,120,lo(z-s*40,z+s*82),x+100,128,hi(z-s*40,z+s*82),'velvet',{ceiling:true,nonav:true});};
  stall(-300,-190,-1,'siding');stall(300,-190,-1,'siding_b');stall(-300,190,1,'siding_b');stall(300,190,1,'siding');
  k.box(-40,0,-40,40,40,40,'bricks');k.box(-180,0,-30,-120,56,30,'planks');k.box(120,0,-30,180,56,30,'planks');
  // south: two boat sheds you can run through, a hauled-out boat between them
  const shed=(x0,x1)=>{const z0=400,z1=690,h=150,m=(x0+x1)/2;
    k.box(x0,0,z0,x1,4,z1,'woodfloor');k.box(x0-14,h,z0-14,x1+14,h+12,z1+14,'roof',{ceiling:true});
    for(const x of [x0,x1])k.wallZ(x,z0,z1,0,h,'siding',[[490,600,0,112]]);
    for(const z of [z0,z1])k.wallX(z,x0,x1,0,h,'siding',[[m-70,m+70,52,116]]);
    k.box(m-50,4,z0+30,m+50,50,z0+90,'planks');};
  shed(-760,-360);shed(360,760);
  k.box(-150,0,500,150,46,580,'carpaint');k.box(-90,46,515,90,74,565,'carpaint_b');
  // flanks: vans, hedges and low walls with gaps
  const van=(x,z,mat)=>{k.box(x-100,0,z-40,x+100,56,z+40,mat);k.box(x-100,56,z-36,x-30,84,z+36,'glass');};
  van(-820,-330,'carpaint_b');van(820,330,'carpaint');
  k.box(-660,0,-140,-636,52,140,'bricks');k.box(636,0,-140,660,52,140,'bricks');
  k.wallX(-470,-1180,-720,0,70,'hedge',[[-980,-900,0,70]],24);k.wallX(-470,720,1180,0,70,'hedge',[[900,980,0,70]],24);
  k.wallX(360,-1180,-800,0,70,'hedge',[[-1020,-940,0,70]],24);k.wallX(360,800,1180,0,70,'hedge',[[940,1020,0,70]],24);
  // spawn yards: a harbour office and a skip for cover
  k.box(-1450,0,-120,-1250,120,120,'siding_b');k.box(1250,0,-120,1450,120,120,'siding_b');
  k.box(-1180,0,-330,-1070,60,-240,'carpaint');k.box(1070,0,240,1180,60,330,'carpaint_b');
  // lights: string lamps over the market, lamps in the sheds, cold floodlights on the quay
  k.light([0,170,0],0xffd9a0,1.6,900);k.light([-300,110,-150],0xffc890,1.1,520);k.light([300,110,-150],0xffc890,1.1,520);k.light([-300,110,150],0xffc890,1.1,520);k.light([300,110,150],0xffc890,1.1,520);
  k.light([-560,105,545],0xffd9a0,1.3,620);k.light([560,105,545],0xffd9a0,1.3,620);k.light([0,260,620],0xb0c8ff,.9,1000);
  k.light([0,280,-740],0xffe0b0,.9,1000);k.light([-950,300,-500],0xb0c8ff,.7,1100);k.light([950,300,-500],0xb0c8ff,.7,1100);k.light([-1000,300,500],0xffb070,.7,1000);k.light([1000,300,500],0xffb070,.7,1000);
  // spawns: two teams, spread along the quay
  for(const [i,z] of [-700,-520,-340,-180,180,340,520,680].entries()){k.entity({type:'spawn',team:0,position:[-1350+(i%2)*80,0,z],yaw:-Math.PI/2});k.entity({type:'spawn',team:1,position:[1350-(i%2)*80,0,z],yaw:Math.PI/2});}
  // lane waypoints for bots (lane, x order west→east)
  const lanes={north:[[-1100,-620],[-800,-580],[-400,-580],[0,-580],[400,-580],[800,-580],[1100,-620]],
    mid:[[-1100,-200],[-800,0],[-520,0],[0,100],[520,0],[800,0],[1100,200]],
    south:[[-1100,600],[-860,545],[-560,545],[0,440],[560,545],[860,545],[1100,600]]};
  for(const [lane,pts] of Object.entries(lanes))pts.forEach((p,i)=>k.entity({type:'waypoint',lane,index:i,position:[p[0],0,p[1]]}));
  return {kit:k,links:[],start:[],sky:0x2c3848};
}
