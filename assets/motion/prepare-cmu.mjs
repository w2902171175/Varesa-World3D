import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
const base=path.dirname(fileURLToPath(import.meta.url)),asf=fs.readFileSync(path.join(base,'35.asf'),'utf8');
const bones={};
for(const block of asf.split(':bonedata')[1].split(':hierarchy')[0].split(/\bbegin\b/).slice(1)){
 const name=block.match(/\bname\s+(\S+)/)?.[1];if(!name)continue;
 const vec=key=>block.match(new RegExp('\\b'+key+'\\s+([-\\d.eE]+)\\s+([-\\d.eE]+)\\s+([-\\d.eE]+)')).slice(1).map(Number);
 const axis=vec('axis').map(THREE.MathUtils.degToRad);
 bones[name]={name,direction:new THREE.Vector3(...vec('direction')),length:+block.match(/\blength\s+(\S+)/)[1],axis:new THREE.Quaternion().setFromEuler(new THREE.Euler(...axis,'ZYX')),dof:block.match(/\bdof\s+([^\n]+)/)?.[1].trim().split(/\s+/)||[]};
}
for(const line of asf.split(':hierarchy')[1].split(/\r?\n/)){
 const [parent,...children]=line.trim().split(/\s+/);if(!children.length)continue;
 for(const name of children)if(bones[name])bones[name].parent=parent;
}
function parse(name){
 const frames=[];let f;
 for(const line of fs.readFileSync(path.join(base,name),'utf8').split(/\r?\n/)){
  const s=line.trim();if(/^\d+$/.test(s)){f={};frames.push(f);}
  else if(f&&s&&!s.startsWith('#')&&!s.startsWith(':')){const [n,...values]=s.split(/\s+/);f[n]=values.map(Number);}
 }
 return frames.map((f,i)=>{
  const rootP=new THREE.Vector3(...f.root.slice(0,3));
  const rootQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(...f.root.slice(3).map(THREE.MathUtils.degToRad),'ZYX'));
  const positions={root:rootP},rotations={root:rootQ};
  function calc(name){if(positions[name])return;const n=bones[name];if(n.parent!=='root')calc(n.parent);
   const v=[0,0,0],sample=f[name]||[];n.dof.forEach((d,j)=>v['xyz'.indexOf(d[1])]=THREE.MathUtils.degToRad(sample[j]||0));
   const local=n.axis.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...v,'ZYX'))).multiply(n.axis.clone().invert());
   rotations[name]=rotations[n.parent].clone().multiply(local);
   positions[name]=positions[n.parent].clone().add(n.direction.clone().multiplyScalar(n.length).applyQuaternion(rotations[name]));
  }
  Object.keys(bones).forEach(calc);
  return {i,positions,rotations};
 });
}
const selected=['lhipjoint','lfemur','ltibia','lfoot','ltoes','rhipjoint','rfemur','rtibia','rfoot','rtoes','lowerback','upperback','thorax','lowerneck','upperneck','head','lclavicle','lhumerus','lradius','lwrist','lhand','rclavicle','rhumerus','rradius','rwrist','rhand'];
for(const [name,file] of [['walk','35_01.amc'],['run','35_17.amc']]){
 const frames=parse(file),out=[];
 for(let i=0;i<frames.length;i++){
  const f=frames[i],prev=frames[Math.max(0,i-6)],next=frames[Math.min(frames.length-1,i+6)];
  const velocity=next.positions.root.clone().sub(prev.positions.root),heading=Math.atan2(velocity.x,velocity.z);
  const inverseHeading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-heading);
  const p=Object.fromEntries(['root',...selected].map(n=>[n,f.positions[n].clone().sub(f.positions.root).applyQuaternion(inverseHeading).toArray()]));
  const q=Object.fromEntries(['root',...selected].map(n=>[n,inverseHeading.clone().multiply(f.rotations[n]).toArray()]));
  out.push({p,q,y:f.positions.root.y,position:f.positions.root.toArray(),heading});
 }
 fs.writeFileSync(path.join(base,name+'-capture.json'),JSON.stringify(out));
 const rows=out.filter((_,i)=>i%12===0).map((f,j)=>({frame:j*12,rootY:+f.y.toFixed(2),leftZ:+f.p.lfoot[2].toFixed(2),rightZ:+f.p.rfoot[2].toFixed(2),leftY:+f.p.lfoot[1].toFixed(2),rightY:+f.p.rfoot[1].toFixed(2)}));
 console.log(name,frames.length,JSON.stringify(rows));
}
