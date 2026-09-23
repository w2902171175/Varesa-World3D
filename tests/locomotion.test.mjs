import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {advanceVelocity,advanceHeading,sampleDisplacement,angleDelta} from '../src/locomotion.js';
import {createPhysics} from '../src/world-physics.js';

test('holding sprint into a wall produces zero animation travel after contact',()=>{
 const physics=createPhysics(),velocity=new THREE.Vector3(),target=new THREE.Vector3(0,0,-4.6);
 let position=new THREE.Vector3(-2,.3,2.7),oldVelocity=new THREE.Vector3(),motion;
 for(let i=0;i<120;i++){
  advanceVelocity(velocity,target,1/60,{running:true});const next=physics.move(position,velocity.clone().multiplyScalar(1/60));
  motion=sampleDisplacement(position,next,oldVelocity,Math.PI,1/60);position=next;oldVelocity.copy(motion.velocity);
 }
 assert.ok(position.z>=1.85-1e-4);assert.equal(motion.speed,0);assert.equal(motion.distance,0);
});
test('walking accelerates promptly and releases without a long sliding tail',()=>{
 const v=new THREE.Vector3(),target=new THREE.Vector3(0,0,2.35);
 for(let i=0;i<9;i++)advanceVelocity(v,target,1/60);assert.ok(v.z>2.3);
 for(let i=0;i<8;i++)advanceVelocity(v,new THREE.Vector3(),1/60);assert.equal(v.length(),0);
});
test('180-degree reversal has bounded angular speed and acceleration',()=>{
 let heading=0,omega=0,lastOmega=0;
 for(let i=0;i<90;i++){
  const next=advanceHeading(heading,omega,Math.PI,1/60);
  assert.ok(Math.abs(next.turnRate)<=10.5+1e-6);
  // Arrival can clamp the last remaining fraction of rotation.
  if(Math.abs(next.error)>.05)assert.ok(Math.abs(next.angularVelocity-lastOmega)<=78/60+1e-5);
  heading=next.heading;omega=next.angularVelocity;lastOmega=omega;
 }
 assert.ok(Math.abs(angleDelta(Math.PI,heading))<.002);
});
test('acceleration remains consistent at 30, 60 and 120 Hz',()=>{
 const endings=[30,60,120].map(hz=>{const v=new THREE.Vector3(),p=new THREE.Vector3();for(let i=0;i<hz;i++){advanceVelocity(v,new THREE.Vector3(0,0,4.6),1/hz,{running:true});p.addScaledVector(v,1/hz);}return p.z;});
 assert.ok(Math.max(...endings)-Math.min(...endings)<.08);
});
test('local motion follows body orientation and has finite zero-dt behavior',()=>{
 const motion=sampleDisplacement(new THREE.Vector3(),new THREE.Vector3(.1,0,0),new THREE.Vector3(),Math.PI/2,.1);
 assert.ok(Math.abs(motion.localVelocity.x)<1e-8);assert.ok(Math.abs(motion.localVelocity.z-1)<1e-8);
 const stopped=sampleDisplacement(new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),0,0);
 assert.equal(stopped.speed,0);assert.equal(stopped.acceleration.x,0);
});
