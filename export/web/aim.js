import * as THREE from 'three';

// Aim assist for controllers and touch: finds the target nearest the crosshair so look
// speed can ease off over it and aiming down sights can pull a little toward it.
const _d=new THREE.Vector3(),_f=new THREE.Vector3();
export function assistTarget(camera,points,{cone=.16,range=1800}={}){
  camera.getWorldDirection(_f);let best=null;
  for(const p of points){
    _d.copy(p).sub(camera.position);const dist=_d.length();if(dist>range||dist<1)continue;
    const angle=Math.acos(Math.min(1,_d.divideScalar(dist).dot(_f)));if(angle>cone||best&&best.angle<angle)continue;
    best={point:p,angle,dist,yaw:Math.atan2(-_d.x,-_d.z),pitch:Math.asin(THREE.MathUtils.clamp(_d.y,-1,1))};
  }
  return best;
}
// Turn the camera toward a target by at most `max` radians (used once when the aim button goes down).
export function pullToward(camera,target,max=.09){
  let dy=((target.yaw-camera.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;const dp=target.pitch-camera.rotation.x,len=Math.hypot(dy,dp);if(len<1e-5)return;
  const k=Math.min(1,max/len);camera.rotation.y+=dy*k;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x+dp*k,-1.5,1.5);
}
