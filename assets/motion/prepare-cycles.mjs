import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
const base=path.dirname(fileURLToPath(import.meta.url));
const links={leftThigh:['lhipjoint','lfemur'],leftShin:['lfemur','ltibia'],leftFoot:['ltibia','lfoot'],rightThigh:['rhipjoint','rfemur'],rightShin:['rfemur','rtibia'],rightFoot:['rtibia','rfoot'],leftArm:['lclavicle','lhumerus'],leftForearm:['lhumerus','lwrist'],rightArm:['rclavicle','rhumerus'],rightForearm:['rhumerus','rwrist']};
const output={};
for(const [name,start,end]of[['walk',156,288],['run',24,116]]){
 const raw=JSON.parse(fs.readFileSync(path.join(base,name+'-capture.json'))),source=raw.slice(start,end),n=source.length;
 const avgY=source.reduce((s,f)=>s+f.y,0)/n;
 const angles=source.map(f=>{const r=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...f.q.root),'YXZ'),u=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...f.q.thorax),'YXZ');return [r.x,r.y,r.z,u.x,u.y,u.z];});
 const average=angles[0].map((_,i)=>angles.reduce((s,r)=>s+r[i],0)/n);
 const distance=Math.hypot(raw[end].position[0]-raw[start].position[0],raw[end].position[2]-raw[start].position[2])*.0535;
 const frames=[];
 for(let k=0;k<64;k++){
  const p=k/64*n,i=Math.floor(p),f=source[i],g=source[(i+1)%n],u=p-i;
  const row={};
  for(const [key,[a,b]]of Object.entries(links)){
   const vector=(x)=>new THREE.Vector3(...x.p[b]).sub(new THREE.Vector3(...x.p[a])).normalize();
   row[key]=vector(f).lerp(vector(g),u).normalize().toArray().map(x=>+x.toFixed(6));
  }
  row.body=angles[i].map((x,j)=>+(x-average[j]).toFixed(6));
  row.bob=+THREE.MathUtils.clamp((f.y-avgY)*.0535*(name==='run'?.5:.65),-.027,.035).toFixed(6);
  frames.push(row);
 }
 // Remove tiny cycle seam differences without changing contact/passing poses.
 const first=frames[0],last=frames.at(-1);
 for(let i=0;i<5;i++){const w=(5-i)/5*.5;for(const key of Object.keys(links)){const a=new THREE.Vector3(...frames[i][key]),b=new THREE.Vector3(...frames[63-i][key]);const mid=a.clone().add(b).normalize();frames[i][key]=a.lerp(mid,w).normalize().toArray();frames[63-i][key]=b.lerp(mid,w).normalize().toArray();}}
 output[name]={duration:n/120,distance,frames};
}
fs.writeFileSync(path.join(base,'cycles.js'),'// Retargeting source: CMU Graphics Lab, trials 35_01 and 35_17. See SOURCE.md.\nexport const capturedCycles='+JSON.stringify(output)+';\n');
console.log(Object.fromEntries(Object.entries(output).map(([k,v])=>[k,{duration:v.duration,distance:v.distance,frames:v.frames.length}])));
