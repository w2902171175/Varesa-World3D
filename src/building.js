import * as THREE from 'three';
import {makeContext} from './helpers.js';

export function buildShop(ctx,roof){
 const {box,cyl,tube,plane,label,add,mat}=ctx;
 const cream='#bec6bf', frame='#294952', trim='#497478', dark='#243846';
 box(9.45,.25,7.1,-1,.32,-2.12,'#8c9895');
 box(9.15,.04,6.85,-1,.46,-2.12,'#dfd5b4',{emissive:'#a0844f',emissiveIntensity:.13});
 box(7.52,3.74,.18,-1.96,2.4,-5.63,cream);
 box(.60,3.74,.18,3.42,2.4,-5.63,cream);
 box(1.32,1.00,.18,2.46,3.77,-5.63,cream);
 box(.2,3.74,7,-5.72,2.4,-2.12,'#93a6a2');
 // Tile courses on the blind alley wall.
 for(let y=.78;y<3.8;y+=.44)box(.011,.018,6.85,-5.828,y,-2.12,'#708b8c',{outline:false});
 for(let z=-5.3;z<1.2;z+=.85)box(.012,3.1,.018,-5.83,2.15,z,'#708b8c',{outline:false});
 box(6.225,.46,.16,-2.5625,.77,1.4,cream);
 box(.925,.46,.16,3.2125,.77,1.4,cream);
 box(.16,.46,6.9,3.69,.77,-2.1,cream);
 const glass=new THREE.MeshPhysicalMaterial({color:'#b5efda',metalness:.05,roughness:.13,transparent:true,opacity:.065,depthWrite:false,side:THREE.DoubleSide});
 function pane(w,h,x,y,z,ry=0){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),glass);m.position.set(x,y,z);m.rotation.y=ry;add(m);return m;}
 for(const x of [-5.69,-3.08,-.38,.55,2.75,3.68])box(.12,3.2,.19,x,2.38,1.44,frame);
 box(6.225,.11,.2,-2.5625,1.03,1.45,trim);box(.925,.11,.2,3.2125,1.03,1.45,trim);box(9.42,.15,.22,-1,3.68,1.45,frame);
 pane(2.48,2.57,-4.38,2.35,1.453);pane(2.54,2.57,-1.72,2.35,1.453);
 pane(.79,2.57,.07,2.35,1.453);pane(.79,2.57,3.21,2.35,1.453);
 // A little reflected sky catches the panes without concealing the shelves.
 for(const x of [-5.14,-4.9,-2.18]){
  const p=plane(.043,2.14,x,2.41,1.46,'#b5def0',{opacity:.14,rotationZ:-.18});p.material.depthWrite=false;
 }
 for(const z of [-5.6,-3.22,-.95,1.4])box(.19,3.2,.12,3.71,2.38,z,frame);
 box(.21,.11,6.96,3.72,1.03,-2.08,trim);box(.22,.15,7.02,3.72,3.68,-2.08,frame);
 for(const [z,d] of [[-4.42,2.26],[-2.08,2.15],[.23,2.2]])pane(d,2.55,3.737,2.34,z,Math.PI/2);
 // Automatic sliding doors, guide rails, striped safety transfers.
 box(2.34,.22,.32,1.65,3.51,1.52,'#477577');
 const doorPanels=[];
 for(const x of [1.10,2.20]){
  const start=ctx.group.children.length;
  pane(1.07,2.78,x,2,1.5);
  for(const ex of [x-.54,x+.54])box(.055,2.88,.09,ex,2,1.54,'#87a7a6');
  box(1.08,.08,.095,x,.60,1.54,'#63868a');
  box(1.04,.09,.012,x,1.76,1.56,'#6baca8');
  box(1.04,.026,.013,x,1.69,1.56,'#f1bc7d');
  label('自動ドア',.57,.18,x,2.02,1.58,{fg:'#cae6df',bg:'#3e686b'});
  const parts=ctx.group.children.slice(start),panel=new THREE.Group();panel.userData.dynamic=true;panel.name='自动门';ctx.group.add(panel);for(const o of parts)panel.add(o);doorPanels.push(panel);
 }
 box(.17,.1,.09,1.65,3.35,1.68,dark);sphereLED();
 function sphereLED(){const led=ctx.sphere(.022,1.65,3.36,1.733,'#81f4d4',{emissive:'#81f4d4',emissiveIntensity:1});return led;}
 box(3.55,.018,.21,1.65,.555,1.55,'#79908d');
 box(2.6,.045,.96,1.65,.345,2.02,'#273e44');
 for(let z=1.64;z<2.46;z+=.09)box(2.43,.007,.012,1.65,.37,z,'#4e6665',{outline:false});
 label('いらっしゃいませ',1.49,.27,1.65,.375,2.03,{rotationX:-Math.PI/2,fg:'#afc7b8'});
 // Continuous illuminated fascia turns the corner.
 box(10.08,.8,.44,-.99,4.08,1.6,'#cddac9',{emissive:'#e8ddb5',emissiveIntensity:.20});
 box(.44,.8,7.55,3.84,4.08,-1.99,'#cddac9',{emissive:'#e8ddb5',emissiveIntensity:.18});
 for(const [y,h,c] of [[4.44,.065,'#335e66'],[4.33,.07,'#389f95'],[3.76,.09,'#e58b78'],[3.69,.055,'#28545e']]){
  box(10.15,h,.025,-1,y,1.833,c,{emissive:c,emissiveIntensity:.4});box(.025,h,7.7,4.066,y,-1.97,c,{emissive:c,emissiveIntensity:.3});
 }
 label('雨宿り',3.15,.55,-2.29,4.04,1.84,{fg:'#193f46',fontSize:235});
 label('AMAYADORI',2.5,.29,.44,4.13,1.844,{fg:'#365c5d',fontSize:190});
 label('MART',1.48,.24,.44,3.88,1.844,{fg:'#596f61',fontSize:185});
 label('24',.65,.52,2.66,4.04,1.85,{fg:'#d47b69'});
 label('雨宿り MART',3.94,.51,4.083,4.055,-1.66,{fg:'#315e62',rotationY:Math.PI/2});
 // Rain canopy: shallow projecting metal lip and a warm lit underside.
 box(10.2,.15,1.02,-1,3.57,1.68,'#304c55');
 box(9.95,.035,.78,-1,3.488,1.7,'#f5dfb1',{emissive:'#ffe0a0',emissiveIntensity:.5});
 box(10.2,.11,.095,-1,3.52,2.18,'#43646a');
 for(let x=-5.8;x<4;x+=1.25)box(.035,.03,.85,x,3.55,1.7,'#819996',{outline:false});
 tube([[-5.94,3.55,2.13],[-5.94,3.3,2.1],[-5.94,.56,2.1],[-6.08,.34,2.22]],.055,'#496774');
 // Roof is a separate, fading group, so a high-angle view reveals the interior.
 const r=makeContext(roof);
 r.box(10.04,.19,7.63,-1,4.58,-2,'#3b5862');
 r.box(9.75,.12,7.4,-1,4.73,-2,'#4f7179');
 for(const x of [-5.97,3.97])r.box(.13,.25,7.67,x,4.79,-2,'#8ba4a0');
 for(const z of [-5.81,1.81])r.box(10.04,.25,.13,-1,4.79,z,'#8ba4a0');
 for(let x=-5.3;x<3.8;x+=.83)r.box(.016,.012,7.26,x,4.801,-2,'#63858a',{outline:false});
 // Roof service equipment, conduit and modest standing water.
 r.box(1.67,.65,1.04,-3.47,5.1,-4.13,'#a1b4b0');r.box(1.73,.08,1.11,-3.47,5.45,-4.13,'#c2cdc2');
 for(let i=0;i<8;i++)r.box(.12,.41,.03,-4.06+i*.17,5.12,-3.596,'#536f76',{outline:false});
 r.cyl(.29,.29,.065,-3.05,5.52,-4.13,'#4a6670');
 for(let i=0;i<4;i++){const blade=r.box(.4,.025,.068,-3.05,5.561,-4.13,'#94aaa8',{outline:false});blade.rotation.y=i*Math.PI/4;}
 r.tube([[-4.28,5.02,-4.16],[-4.55,4.96,-4.16],[-4.55,4.86,-5.4]],.035,'#a4b6b3');
 r.cyl(.13,.13,.7,2.57,5.11,-4.73,'#839da1');r.cyl(.28,.16,.12,2.57,5.5,-4.73,'#bad0c9');
 const puddle=new THREE.Mesh(new THREE.CircleGeometry(1,48),new THREE.MeshBasicMaterial({color:'#91b4b9',transparent:true,opacity:.13,depthWrite:false}));puddle.rotation.x=-Math.PI/2;puddle.scale.set(1.35,.63,1);puddle.position.set(.4,4.799,-3.2);roof.add(puddle);
 // Store-wall fixtures in the back alley keep the reverse view worth exploring.
 const backStart=ctx.group.children.length;
 box(1.27,2.70,.12,2.47,1.82,-5.63,'#5c787b');
 label('STAFF ONLY',.8,.16,2.47,2.52,-5.704,{fg:'#b4c5bb',rotationY:Math.PI});
 box(.7,.35,.035,2.47,2.06,-5.711,'#243e47');
 box(.05,.25,.045,2.89,1.56,-5.73,'#b0c8c2');
 const backParts=ctx.group.children.slice(backStart),backDoor=new THREE.Group();backDoor.position.set(1.81,0,-5.63);backDoor.userData.dynamic=true;backDoor.name='后场门';ctx.group.add(backDoor);ctx.group.updateMatrixWorld(true);for(const o of backParts)backDoor.attach(o);
 for(const x of [-4.91,3.15])tube([[x,4.36,-5.8],[x,1,-5.8],[x,.25,-6]],.055,'#667f84');
 box(1.44,.73,.36,-1.5,2.5,-5.96,'#9bb0ad');
 for(let x=-2.07;x<-1;x+=.13)box(.035,.51,.025,x,2.5,-6.156,'#4d6c73',{outline:false});
 label('雨宿り商店',1.65,.39,-5.845,2.77,-3.73,{rotationY:-Math.PI/2,bg:'#244850',fg:'#b7cdc0'});
 // Vintage enamel address plates and small window notices.
 label('桜町 三丁目',.75,.3,3.833,2.9,1.04,{rotationY:Math.PI/2,bg:'#385c69',fg:'#d1ddd0'});
 label('おにぎり\n新発売',.6,.77,-.92,2.29,1.475,{bg:'#e5bf80',fg:'#584e43'});
 label('挽きたて\nCOFFEE\n¥120',.59,.79,-3.9,2.2,1.475,{bg:'#b56351',fg:'#ffebc0'});
 let frontAmount=0,backAmount=0,backOpen=false;
 return {roof,doorPanels,backDoor,get frontAmount(){return frontAmount;},getBackOpen:()=>backOpen,setBackOpen:value=>{backOpen=!!value;},updateDoors(dt,nearby){frontAmount=THREE.MathUtils.damp(frontAmount,nearby?1:0,7,dt);doorPanels[0].position.x=-1.08*frontAmount;doorPanels[1].position.x=1.08*frontAmount;backAmount=THREE.MathUtils.damp(backAmount,backOpen?1:0,5,dt);backDoor.rotation.y=-Math.PI*.53*backAmount;}};
}
