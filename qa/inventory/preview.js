// UI verification fixture: real interaction/economy APIs, isolated from a player's game.
import * as THREE from 'three';
import {createInteractions} from '../../src/interactions.js';
import {createInventoryUI} from '../../src/inventory-ui.js';
const scene=new THREE.Scene(),playerRoot=new THREE.Group();scene.add(playerRoot);
const products=[
 ['snack','海盐薯片',130,'#e9b77b'],['snack','海盐薯片',130,'#e9b77b'],
 ['snack','抹茶巧克力',190,'#8dad88'],['drink','柚子汽水',150,'#dbb373'],['drink','柚子汽水',150,'#dbb373'],
 ['drink','冰绿茶',150,'#82b6a0'],['onigiri','鲑鱼饭团',140,'#f0dbb8'],['onigiri','鲑鱼饭团',140,'#f0dbb8'],
 ['bento','时蔬便当',420,'#c99861'],['oden','热关东煮',200,'#e2c793'],['icecream','北海道冰淇淋',180,'#aab2d0']
].map(([kind,name,price,color],i)=>({id:'fixture-'+i,kind,name,price,color,position:new THREE.Vector3(.9,1,0),group:new THREE.Group()}));
const host=document.createElement('div');host.id='game-ui';document.body.append(host);
const status=document.createElement('div');status.className='fixture-status';status.setAttribute('role','status');document.body.append(status);
const interactions=createInteractions({THREE,scene,playerRoot,interiorRefs:{products},initialYen:5000,notify:message=>{status.textContent=message;}});
let time=0;
function move(x,z,yaw){playerRoot.position.set(x,z>1.52?.3:.49,z);playerRoot.rotation.y=yaw;for(let i=0;i<3;i++)interactions.update(.1,time+=.1);}
move(-2.9,-.1,0);interactions.interact('basket');
for(const product of products){move(.9,.9,Math.PI);interactions.interact(product.id);}
move(1.2,-1.46,Math.PI/2);interactions.interact('checkout');
move(3.35,3.0,Math.PI);interactions.interact('umbrella');interactions.stowHeld();
let panel;
const act=(name,id)=>{interactions[name](id);panel.update(interactions.getState());};
panel=createInventoryUI({mount:host,onClose:()=>{panel.setOpen(false);document.querySelector('#reopen').hidden=false;},onEquip:id=>act('equipItem',id),onStow:()=>act('stowHeld'),onUse:id=>act('useItem',id),onToggleUmbrella:()=>act('toggleUmbrella')});
panel.setOpen(true,interactions.getState());
const reopen=document.createElement('button');reopen.id='reopen';reopen.hidden=true;reopen.textContent='重新打开背包检查';reopen.onclick=()=>{reopen.hidden=true;panel.setOpen(true,interactions.getState());};document.body.append(reopen);
let last=performance.now();function frame(now){const dt=Math.min(.06,(now-last)/1000);last=now;interactions.update(dt,time+=dt);if(panel.isOpen)panel.update(interactions.getState());requestAnimationFrame(frame);}requestAnimationFrame(frame);
