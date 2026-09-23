import * as THREE from 'three';
import {capturedCycles} from '../assets/motion/cycles.js';
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp,TAU=Math.PI*2;
class Spring{
 constructor(value=0){this.value=value;this.velocity=0;}
 step(target,dt,w=15,z=1){const x=this.value-target,v=this.velocity;if(z>=.999){const a=v+w*x,d=Math.exp(-w*dt);this.value=target+(x+a*dt)*d;this.velocity=(v-w*a*dt)*d;}else{const f=w*Math.sqrt(1-z*z),d=Math.exp(-z*w*dt),c=Math.cos(f*dt),s=Math.sin(f*dt),b=(v+z*w*x)/f;this.value=target+d*(x*c+b*s);this.velocity=d*(v*c-(z*w*b+x*f)*s);}return this.value;}
}
// Retargeted CMU pose cycles own the body's motion. The original PMX grants
// still drive the weighted D bones. Floor correction cannot force a crouch.
export function createMotionController({mesh,root,visual,scale,groundOffset=0,sockets={}}){
 const all=mesh.skeleton.bones,bones=Object.fromEntries(all.map(b=>[b.name,b])),indices=new Map(all.map((b,i)=>[b,i]));
 const rest=all.map(b=>({p:b.position.clone(),q:b.quaternion.clone()}));
 const raw=mesh.geometry.userData.MMD?.grants||[],byIndex=new Map(raw.map(g=>[g.index,g])),grants=[],seen=new Set();
 function visit(g){if(seen.has(g.index))return;seen.add(g.index);if(byIndex.has(g.parentIndex))visit(byIndex.get(g.parentIndex));grants.push(g);}raw.forEach(visit);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),origin=new THREE.Vector3(),actual=new THREE.Vector3(),goal=new THREE.Vector3();
 const q=new THREE.Quaternion(),inv=new THREE.Quaternion(),rootQ=new THREE.Quaternion(),deltaQ=new THREE.Quaternion(),e=new THREE.Euler();
 const move=new Spring(),run=new Spring(),ride=new Spring(),air=new Spring(),landing=new Spring(),pitch=new Spring(),bank=new Spring(),look=new Spring(),floorCorrection=new Spring();
 const sipping=new Spring(),reaching=new Spring(),umbrella=new Spring(),umbrellaEquipped=new Spring(),carrying=new Spring(),handX=new Spring(-.15),handY=new Spring(1.02),handZ=new Spring(.18);
 let phase=0,time=0,wasAir=false,lastYaw=root.rotation.y,previousRoot=root.position.clone();
 const joints={leftThigh:['左足','左ひざ'],leftShin:['左ひざ','左足首'],leftFoot:['左足首','左つま先'],rightThigh:['右足','右ひざ'],rightShin:['右ひざ','右足首'],rightFoot:['右足首','右つま先'],leftArm:['左腕','左ひじ'],leftForearm:['左ひじ','左手首'],rightArm:['右腕','右ひじ'],rightForearm:['右ひじ','右手首']};
 const chains=[...['左','右'].map(side=>Array.from({length:19},(_,i)=>({name:`${side}F_${i}_1`,x:new Spring(),z:new Spring()}))),Array.from({length:16},(_,i)=>({name:`尾_${i}_1`,x:new Spring(),z:new Spring()}))];
 const footIndices=new Set(['左足首D','左足先EX','右足首D','右足先EX'].map(n=>indices.get(bones[n]))),candidates=[[],[]];
 const pos=mesh.geometry.attributes.position,skin=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
 for(let i=0;i<pos.count;i++)if(pos.getY(i)*scale<.055){let w=0;for(let j=0;j<4;j++)if(footIndices.has(skin.array[i*4+j]))w+=weights.array[i*4+j];if(w>.85)candidates[pos.getX(i)>0?0:1].push(i);}
 const soleSamples=candidates.flatMap(list=>{list.sort((x,y)=>pos.getZ(x)-pos.getZ(y));const count=Math.min(18,list.length);return Array.from({length:count},(_,i)=>list[Math.floor(i*(list.length-1)/Math.max(1,count-1))]);});
 const contacts=[true,true],solePoints=[new THREE.Vector3(),new THREE.Vector3()];
 const debug={phase:0,source:'CMU 35_01 / 35_17',grants:grants.length,feet:[]};
 function pose(name,x=0,y=0,z=0){const bone=bones[name];if(bone)bone.quaternion.copy(rest[indices.get(bone)].q).multiply(q.setFromEuler(e.set(x,y,z,'YXZ')));}
 function grantPass(){for(const g of grants){const dst=all[g.index],src=all[g.parentIndex];dst.quaternion.copy(rest[g.index].q);dst.position.copy(rest[g.index].p);if(g.affectRotation)dst.quaternion.multiply(q.identity().slerp(src.quaternion,g.ratio)).normalize();if(g.affectPosition)dst.position.addScaledVector(a.copy(src.position).sub(rest[g.parentIndex].p),g.ratio);}}
 function pointBone(bone,child,target,weight=1){bone.getWorldPosition(origin);child.getWorldPosition(actual);bone.getWorldQuaternion(inv).invert();a.copy(actual).sub(origin).applyQuaternion(inv).normalize();b.copy(target).sub(origin).applyQuaternion(inv).normalize();deltaQ.setFromUnitVectors(a,b);q.identity().slerp(deltaQ,clamp(weight,0,1));bone.quaternion.multiply(q).normalize();bone.updateWorldMatrix(false,true);}
 function retarget(key,direction,weight){if(weight<.00001)return;const [parent,child]=joints[key],bone=bones[parent];bone.getWorldPosition(origin);goal.copy(direction).applyQuaternion(rootQ).add(origin);pointBone(bone,bones[child],goal,weight);}
 function solveHand(side,target,weight){if(weight<.0001)return;const wrist=bones[side+'手首'];wrist.getWorldPosition(actual);const handTarget=actual.clone().lerp(target,weight);for(let i=0;i<7;i++)for(const name of [side+'ひじ',side+'腕'])pointBone(bones[name],wrist,handTarget);}
 function sample(cycle,key,p){const n=cycle.frames.length,f=p*n,i=Math.floor(f)%n,u=f-i;return a.fromArray(cycle.frames[i][key]).lerp(b.fromArray(cycle.frames[(i+1)%n][key]),u).normalize().clone();}
 function bodyAt(cycle,p){const n=cycle.frames.length,x=p*n,i=Math.floor(x)%n,u=x-i,f=cycle.frames[i],g=cycle.frames[(i+1)%n];return {body:f.body.map((v,j)=>lerp(v,g.body[j],u)),bob:lerp(f.bob,g.bob,u)};}
 function morph(name,v){const i=mesh.morphTargetDictionary?.[name];if(i!==undefined)mesh.morphTargetInfluences[i]=clamp(v,0,1);}
 function update(dt,state={}){
  dt=clamp(Number(dt)||0,0,.08);if(!dt)return;time+=dt;const t=Number.isFinite(state.time)?state.time:time;
  root.updateWorldMatrix(true,true);root.getWorldQuaternion(rootQ);
  const moved=Math.hypot(root.position.x-previousRoot.x,root.position.z-previousRoot.z),teleport=moved>.60,distance=teleport?0:Number.isFinite(state.distance)?Math.max(0,state.distance):moved;
  const speed=Math.max(0,Number(state.speed)||0),moving=(state.moving??speed>.035)&&speed>.025,riding=!!state.riding,airborne=state.grounded===false||!!state.jumping;
  const turnRate=clamp(Number.isFinite(state.turnRate)?state.turnRate:Math.atan2(Math.sin(root.rotation.y-lastYaw),Math.cos(root.rotation.y-lastYaw))/dt,-8,8);
  lastYaw=root.rotation.y;previousRoot.copy(root.position);if(teleport){floorCorrection.value=0;floorCorrection.velocity=0;}
  move.step(moving?1:0,dt,moving?13:16);run.step(state.running&&moving?1:0,dt,10);ride.step(riding?1:0,dt,12);air.step(airborne?1:0,dt,18);
  if(state.landed||wasAir&&!airborne)landing.velocity-=clamp((Number(state.landingSpeed)||3)*.08,.2,.65);landing.step(0,dt,20,.85);wasAir=airborne;
  const stride=lerp(capturedCycles.walk.distance,capturedCycles.run.distance,run.value);if(!airborne&&!riding)phase=(phase+distance/stride)%1;if(riding)phase=(phase+speed*dt/1.5)%1;
  const motionWeight=move.value*(1-air.value)*(1-ride.value),angle=phase*TAU;
  const walk=bodyAt(capturedCycles.walk,phase),jog=bodyAt(capturedCycles.run,phase),body=walk.body.map((v,i)=>lerp(v,jog.body[i],run.value)),accel=state.acceleration||{x:0,z:0};
  pitch.step(clamp(run.value*.055+(accel.z||0)*.003,-.055,.11),dt,10);bank.step(clamp(-turnRate*speed*.008-(accel.x||0)*.004,-.08,.08),dt,11);look.step(clamp((Number(state.desiredTurn)||0)*.2+turnRate*.035,-.25,.25),dt,13);
  const preparation=state.jumpPreparing?clamp(Number(state.jumpPreparation)||.65,0,1):0;
  for(let i=0;i<all.length;i++){all[i].position.copy(rest[i].p);all[i].quaternion.copy(rest[i].q);}
  // Standing height is the baseline; capture bob is only centimetres.
  const bob=lerp(walk.bob,jog.bob,run.value)*motionWeight;
  visual.position.set(Math.sin(t*.75)*.003*(1-move.value),bob+landing.value-preparation*.045-ride.value*.16,0);visual.rotation.set(0,0,0);
  pose('腰',body[0]*.25*motionWeight,body[1]*.55*motionWeight,body[2]*.35*motionWeight);
  pose('上半身',pitch.value+body[3]*.40*motionWeight+Math.sin(t*1.6)*.004,body[4]*.58*motionWeight+look.value*.2,body[5]*.32*motionWeight+bank.value);
  pose('上半身2',0,-body[1]*.22*motionWeight,0);pose('首',0,look.value*.25,0);pose('頭',-pitch.value*.3,look.value*.55,-bank.value*.35);
  pose('左腕',0,0,-.69);pose('右腕',0,0,.69);pose('左ひじ',-.09,0,-.035);pose('右ひじ',-.09,0,.035);
  for(const g of grants)if(g.index===19||g.index===24)all[g.index].quaternion.copy(rest[g.index].q).multiply(q.identity().slerp(all[g.parentIndex].quaternion,g.ratio));
  root.updateMatrixWorld(true);
  for(const key of Object.keys(joints)){
   const direction=sample(capturedCycles.walk,key,phase).lerp(sample(capturedCycles.run,key,phase),run.value).normalize(),side=key.startsWith('left')?1:-1;
   if(key.endsWith('Foot')){direction.x=direction.x*.22+side*.025;direction.z=Math.max(.20,direction.z);direction.normalize();}
   // The capture actor's forearms cross the centreline when transferred to
   // Varesa's shorter shoulder span. Keep the captured vertical/fore-aft arc,
   // but give each hand its own narrow sagittal corridor beside the torso.
   if(key.endsWith('Arm')){direction.x=side*(lerp(.13,.205,run.value)+clamp(side*direction.x,-.4,.4)*.04);direction.normalize();}
   if(key.endsWith('Forearm')){direction.x=side*lerp(.035,.040,run.value)+direction.x*.055;direction.normalize();}
   retarget(key,direction,motionWeight);
  }
  if(air.value>.001)for(const [side,forward,bend]of[['左',-.25,.65],['右',.12,.80]]){q.setFromEuler(e.set(forward,0,0));bones[side+'足'].quaternion.slerp(q,air.value);q.setFromEuler(e.set(bend,0,0));bones[side+'ひざ'].quaternion.slerp(q,air.value);}
  if(ride.value>.001)for(const [side,offset,sign]of[['左',0,1],['右',Math.PI,-1]])for(const [name,x,z]of[[side+'足',-.94+Math.sin(angle+offset)*.28,-sign*.025],[side+'ひざ',1.18-Math.sin(angle+offset)*.28,0],[side+'腕',-.82,-sign*.39],[side+'ひじ',-.54,-sign*.08]]){q.setFromEuler(e.set(x,0,z));bones[name].quaternion.slerp(q,ride.value);}
  const action=String(state.action?.type||state.action||'').toLowerCase(),drink=/drink|coffee|sip|喝|咖啡/.test(action),eat=/eat|snack|onigiri|食|吃/.test(action),interact=/interact|use|vending|press|buy|purchase|取|按|购买/.test(action);
  const equipped=state.umbrellaEquipped??state.umbrellaOpen??!!state.umbrella;
  const opened=!!equipped&&(state.umbrellaOpen??!!state.umbrella);
  sipping.step(drink||eat?1:0,dt,14);reaching.step(interact?1:0,dt,15);umbrellaEquipped.step(equipped?1:0,dt,14);umbrella.step(opened?1:0,dt,14);carrying.step(state.held||state.carrying?1:0,dt,13);
  const actionWeight=Math.max(sipping.value,reaching.value,umbrellaEquipped.value,carrying.value)*(1-ride.value);
  goal.set(-.15,1.03,.18).lerp(a.set(-.16,1.12,.37),reaching.value)
   .lerp(a.set(-.25,.78,.08),umbrellaEquipped.value)
   .lerp(a.set(-.19,1.11,.17),umbrella.value).lerp(a.set(-.09,1.38,.145),sipping.value);
  handX.step(goal.x,dt,18);handY.step(goal.y,dt,18);handZ.step(goal.z,dt,18);root.updateMatrixWorld(true);
  if(actionWeight>.0001){goal.set(handX.value,handY.value,handZ.value);root.localToWorld(goal);solveHand('右',goal.clone(),actionWeight);}
  for(const side of ['左','右'])for(const finger of ['人指','中指','薬指','小指'])for(const segment of ['１','２','３'])pose(side+finger+segment,0,0,(side==='左'?-1:1)*(.10+run.value*.11+(side==='右'?actionWeight*.42:0)));
  // Restrained inertial follow-through; captured motion owns the torso and limbs.
  chains.forEach(chain=>chain.forEach((node,i)=>{const prev=i?chain[i-1]:null,w=i?.08:1;node.x.step((prev?.x.value||0)*.48+clamp(-(accel.z||0)*.00065+landing.velocity*.012,-.025,.025)*w,dt,12-i*.13,.76);node.z.step((prev?.z.value||0)*.48+clamp((accel.x||0)*.00065+turnRate*.004,-.025,.025)*w,dt,12-i*.13,.76);pose(node.name,node.x.value,0,node.z.value);}));
  for(let i=0;i<5;i++)pose(`呆毛_${i}_1`,chains[0][i].x.value*.55,0,chains[0][i].z.value*.7);
  for(let i=0;i<15;i++)pose(`裙_0_${i}`,Math.max(0,Math.sin(angle+(i<8?0:Math.PI)))*.04*motionWeight,0,0);
  const blink=t%4.7;morph('まばたき',blink<.17?Math.sin(blink/.17*Math.PI):0);morph('にこり',.04+sipping.value*.14);morph('口角上げ',.10);morph('もぐもぐ',eat?Math.max(0,Math.sin(t*8))*.42:0);morph('あ',drink?.035:0);
  grantPass();root.updateMatrixWorld(true);mesh.skeleton.update();
  // Capped sole correction, not a whole-body foot target/IK constraint.
  let minY=Infinity;const footMinimum=[Infinity,Infinity];
  for(const i of soleSamples){mesh.getVertexPosition(i,a);mesh.localToWorld(a);minY=Math.min(minY,a.y);const side=pos.getX(i)>0?0:1;if(a.y<footMinimum[side]){footMinimum[side]=a.y;solePoints[side].copy(a);}}
  const floorY=root.position.y+(!airborne?(Number(state.groundOffset)||0):0),correction=airborne||riding?0:clamp(floorY-minY,-.030,.030);
  floorCorrection.step(correction,dt,22);visual.position.y+=floorCorrection.value;root.updateMatrixWorld(true);mesh.skeleton.update();
  for(const [name,boneName]of[['leftHand','左手首'],['rightHand','右手首']])if(sockets[name]){bones[boneName].getWorldQuaternion(inv).invert();sockets[name].quaternion.copy(inv).multiply(rootQ);}
  debug.phase=phase;debug.speed=speed;debug.run=run.value;debug.airborne=airborne;debug.pelvis=visual.position.y;debug.groundCorrection=floorCorrection.value;debug.soleY=minY+floorCorrection.value;
  debug.feet=['左','右'].map((side,i)=>{
   bones[side+'足首D'].getWorldPosition(a);
   const soleY=footMinimum[i]+floorCorrection.value;
   // Contact edges drive the existing footstep audio. A 6 mm release band
   // avoids repeated sound triggers while a captured heel rolls onto its toe.
   contacts[i]=!airborne&&!riding&&soleY<=floorY+(contacts[i]?.036:.030);
   return {side,position:a.toArray(),stance:contacts[i],soleY,target:[solePoints[i].x,soleY,solePoints[i].z],phase:(phase+i*.5)%1};
  });
 }
 update(1/60,{grounded:true,moving:false,speed:0,time:0});return {update,getDebugState:()=>debug};
}
