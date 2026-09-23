import * as THREE from 'three';

export const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const toward=(current,target,amount)=>current+Math.max(-amount,Math.min(amount,target-current));

// Responsive acceleration with a short, definite braking phase. The animation
// receives the displacement accepted by collision, never this requested speed.
export function advanceVelocity(velocity,target,dt,{running=false,riding=false,grounded=true}={}){
 dt=Math.max(0,Math.min(.06,dt));
 const reversing=velocity.dot(target)<-.04;
 const braking=target.lengthSq()<velocity.lengthSq()-.01||reversing;
 const acceleration=(riding?(braking?14:9):(braking?25:running?22:18))*(grounded?1:.65);
 const difference=target.clone().sub(velocity),length=difference.length();
 if(length>acceleration*dt)difference.multiplyScalar(acceleration*dt/length);
 velocity.add(difference);velocity.y=0;
 if(target.lengthSq()<.0001&&velocity.lengthSq()<.0004)velocity.set(0,0,0);
 return velocity;
}

// A finite angular speed and angular acceleration replace a whole-body whip
// on a sudden 180-degree reversal. The rig receives the residual turn as well.
export function advanceHeading(heading,angularVelocity,target,dt,{running=false,riding=false}={}){
 dt=Math.max(0,Math.min(.06,dt));if(!dt)return {heading,angularVelocity,turnRate:0,error:angleDelta(target,heading)};
 const error=angleDelta(target,heading),maxRate=riding?3.4:running?12:10.5;
 const requested=THREE.MathUtils.clamp(error*16,-maxRate,maxRate);
 let nextVelocity=toward(angularVelocity,requested,(riding?18:78)*dt),step=nextVelocity*dt;
 if(Math.sign(step)===Math.sign(error)&&Math.abs(step)>=Math.abs(error)){step=error;nextVelocity=0;}
 return {heading:heading+step,angularVelocity:nextVelocity,turnRate:step/dt,error:angleDelta(target,heading+step)};
}

export function sampleDisplacement(previous,current,previousVelocity,heading,dt){
 const inverseDt=dt>1e-6?1/dt:0;
 const velocity=new THREE.Vector3((current.x-previous.x)*inverseDt,0,(current.z-previous.z)*inverseDt);
 const acceleration=velocity.clone().sub(previousVelocity).multiplyScalar(inverseDt);
 if(acceleration.length()>30)acceleration.setLength(30);
 const c=Math.cos(heading),s=Math.sin(heading);
 return {velocity,speed:velocity.length(),distance:Math.hypot(current.x-previous.x,current.z-previous.z),
  localVelocity:{x:c*velocity.x-s*velocity.z,z:s*velocity.x+c*velocity.z},
  acceleration:{x:c*acceleration.x-s*acceleration.z,z:s*acceleration.x+c*acceleration.z}};
}
