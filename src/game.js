import * as THREE from 'three';
import {createCharacter} from './character.js';
import {createPhysics} from './world-physics.js';
import {createInteractions} from './interactions.js';
import {createAudio} from './game-audio.js';
import {advanceVelocity,advanceHeading,sampleDisplacement} from './locomotion.js';
import {createCameraFollow} from './camera-follow.js';
import {createInventoryUI} from './inventory-ui.js';
import {createPlayInput} from './play-input.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=n=>Number(n||0).toLocaleString('zh-CN');
const isShop=p=>p.x>-5.59&&p.x<3.58&&p.z>-5.53&&p.z<1.56;

export function createGame({scene,camera,canvas,controls,props,interior,door,resetOverview}){
 const ui=document.createElement('div');ui.id='game-ui';ui.dataset.mode='loading';
 ui.innerHTML=`<div class="brand"><strong>雨宿り</strong><small>雨夜自由漫游 · 瓦雷莎</small></div>
 <div class="top-actions"><button id="bag-toggle" aria-label="打开背包"><span class="wallet">¥ 2,000</span><span class="bag-count">背包</span> <kbd>B</kbd></button><button id="sound-toggle" aria-label="切换环境音">环境声 开</button><button id="view-toggle">观赏 <kbd>Tab</kbd></button></div>
 <div class="controls"><div class="where">月见町 · 街角</div><div><span><kbd>WASD</kbd> 移动</span><span><kbd>Shift</kbd> <span id="sprint-mode">行走模式</span></span><span><kbd>空格</kbd> 跳跃</span></div><div><span id="look-mode">移动鼠标转向</span><span>滚轮缩放</span></div><div><span><kbd>Alt</kbd> 按住显示鼠标</span><span><kbd>Esc</kbd> 释放鼠标</span><span><kbd>U</kbd> 雨伞</span></div></div>
 <div class="interact" hidden><button id="interact-button"><kbd>F</kbd><span><strong></strong><small></small></span></button></div>
 <div class="held"></div><div class="toast" role="status" aria-live="polite"></div>
 <section class="reading" hidden aria-label="阅读内容"><button class="close" aria-label="合上读物">×</button><h2></h2><div class="page"></div><div class="meta"><span></span><button id="read-next">翻页 <kbd>R</kbd></button></div></section>
 <div class="loading"><div class="title">雨 宿 り</div><div class="detail">雨声轻落，街角的灯还亮着。<br>正在准备瓦雷莎与雨夜街景…</div><div class="progress"></div></div>`;
 document.body.append(ui);
 const $=s=>ui.querySelector(s),audio=createAudio(),physics=createPhysics(),keys=new Set(),playInput=createPlayInput();
 const cameraFollow=createCameraFollow({physics});
 const character=createCharacter(scene),player=character.root;
 const position=new THREE.Vector3(1.65,.045,6.05),velocity=new THREE.Vector3(),desiredVelocity=new THREE.Vector3();
 const previousPosition=new THREE.Vector3(),previousActualVelocity=new THREE.Vector3();
 const previousFootStance=[];
 let angularVelocity=0,movementYaw=0,manualCamera=false,renderGroundY=.045,jumpBuffer=0,jumpPrepare=0;
 let indoorZoom=0,cameraOpacity=1,cameraFocusY=1.125,wasPointerLocked=false;
 let expectedPointerUnlock=false,restoreAltLock=false;
 player.position.copy(position);player.rotation.y=Math.PI;
 const contact=new THREE.Mesh(new THREE.CircleGeometry(.29,36),new THREE.MeshBasicMaterial({color:'#06151c',transparent:true,opacity:.29,depthWrite:false}));contact.rotation.x=-Math.PI/2;scene.add(contact);
 const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.058),new THREE.MeshBasicMaterial({color:'#ffe2a7',transparent:true,opacity:.8,depthWrite:false}));marker.visible=false;scene.add(marker);
 const rideVisual=props.bicycle.clone(true);rideVisual.name='骑行中的自行车';rideVisual.visible=false;rideVisual.userData.dynamic=true;scene.add(rideVisual);
 const cameraTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),cameraOffset=new THREE.Vector3();
 let mode='loading',interactions=null,ready=false,yaw=0,pitch=.24,distance=5.7,jump=0,jumpVelocity=0;
 let drag=null,stepTime=0,wasNearDoor=false,toastTime=0,lastToast='',elapsed=0,hudTime=0,lastBag='',lastReading='',warnUntil=0;
 let bagOpen=false,overviewSaved=null,inside=false,previousInside=false;
 const playedInteractions=new Set();
 const inventoryUI=createInventoryUI({mount:ui,onClose:()=>toggleBag(false),onEquip:id=>inventoryAction('equipItem',id),onStow:()=>inventoryAction('stowHeld'),onUse:id=>inventoryAction('useItem',id),onToggleUmbrella:()=>inventoryAction('toggleUmbrella')});
 function inventoryAction(method,id){if(!interactions)return;interactions[method]?.(id);inventoryUI.update(interactions.getState());}
 function collisionFlags(extra={},state=interactions?.getState()){
  const boxes=[];
  if(!state?.bike){const p=props.bicycle.getWorldPosition(new THREE.Vector3()),a=props.bicycle.rotation.y,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),hx=c*.40+s*1.34,hz=c*1.34+s*.40;boxes.push({id:'live-bicycle',minX:p.x-hx,maxX:p.x+hx,minZ:p.z-hz,maxZ:p.z+hz,minY:p.y,maxY:p.y+1.67});}
  props.crates.forEach((ref,i)=>{if(state?.crateIndex===i)return;const p=ref.group.getWorldPosition(new THREE.Vector3());boxes.push({id:'live-crate-'+i,minX:p.x-.25,maxX:p.x+.25,minZ:p.z-.29,maxZ:p.z+.29,minY:p.y,maxY:p.y+.32});});
  return {doorOpen:door.frontAmount>.72,backDoorOpen:door.getBackOpen(),riding:state?.bike,ignoreIds:['parked-bicycle','delivery-crates'],dynamicColliders:boxes,...extra};
 }
 function notify(message){if(message===lastToast&&toastTime>1)return;lastToast=message;$('.toast').textContent=message;$('.toast').classList.add('show');toastTime=4.2;}
 function focusCanvas(){canvas.focus({preventScroll:true});}
 function updateLookHint(){const active=playInput.lookEnabled;$('#look-mode').textContent=playInput.cursorHeld?'鼠标操作中':active?'移动鼠标转向':'点击场景恢复视角';canvas.style.cursor=active?'none':'default';canvas.dataset.mouseFollowing=String(active);canvas.dataset.cursorHeld=String(playInput.cursorHeld);}
 function resumeMouse(){playInput.resumeLook();updateLookHint();}
 function unlockMouse(){if(document.pointerLockElement===canvas){expectedPointerUnlock=true;document.exitPointerLock();}}
 function releaseMouse(){playInput.suspendLook();restoreAltLock=false;unlockMouse();drag=null;keys.clear();playInput.releaseShift('ShiftLeft');playInput.releaseShift('ShiftRight');velocity.set(0,0,0);updateLookHint();}
 function captureMouse(){
  if(!canvas.requestPointerLock||document.pointerLockElement===canvas||mode!=='play'||bagOpen||interactions?.getState().reading||!playInput.lookEnabled)return;
  const unavailable=error=>{canvas.dataset.mouseLockFailure=error?.name||'Unavailable';updateLookHint();};
  try{const pending=canvas.requestPointerLock();pending?.catch(unavailable);}catch(error){unavailable(error);}
 }
 function finishCursorRelease(){
  updateLookHint();
  if(!restoreAltLock)return;
  if(!canLook()){restoreAltLock=false;return;}
  // Fast Alt taps may end before the browser reports its asynchronous unlock.
  if(expectedPointerUnlock)return;
  restoreAltLock=false;captureMouse();
 }
 function updateCursorHold(before){
  if(before===playInput.cursorHeld)return;
  if(playInput.cursorHeld){restoreAltLock=restoreAltLock||document.pointerLockElement===canvas;drag=null;unlockMouse();updateLookHint();}
  else finishCursorRelease();
 }
 function holdCursor(code){const before=playInput.cursorHeld;playInput.pressAlt(code);updateCursorHold(before);}
 function syncMouseModifiers(e){
  if(mode!=='play')return;
  // Modifiers also cover entering the window with Alt already down, or a lost
  // keyup. Reset the baseline before the first mouse move after either change.
  const before=playInput.cursorHeld;playInput.syncAlt(e.altKey);updateCursorHold(before);
 }
 function toggleBag(value=!bagOpen){bagOpen=value;ui.dataset.inventoryOpen=String(value);keys.clear();velocity.set(0,0,0);if(value){releaseMouse();interactions?.closeReading();}inventoryUI.setOpen(value,interactions?.getState());if(!value){focusCanvas();if(mode==='play')resumeMouse();}lastBag='';}
 function onRide(active){
  jump=jumpVelocity=jumpBuffer=jumpPrepare=angularVelocity=0;keys.clear();velocity.set(0,0,0);previousActualVelocity.set(0,0,0);
  if(active){const bikeAt=props.bicycle.getWorldPosition(new THREE.Vector3());bikeAt.x+=.55;position.copy(physics.resolve(bikeAt,collisionFlags({riding:true})));player.rotation.y=props.bicycle.rotation.y;}
  else{
   props.bicycle.position.copy(position);props.bicycle.rotation.y=player.rotation.y;props.bicycle.visible=true;
   const side=new THREE.Vector3(Math.cos(player.rotation.y),0,-Math.sin(player.rotation.y)),fullFlags=collisionFlags({riding:false}),walkingFlags={...fullFlags,ignoreIds:[...fullFlags.ignoreIds,'live-bicycle']};
   let landing=null;
   for(const direction of [side.clone().negate(),side,new THREE.Vector3(-Math.sin(player.rotation.y),0,-Math.cos(player.rotation.y)),new THREE.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y))]){
    const step=physics.move(position,direction.multiplyScalar(.80),walkingFlags),clear=physics.resolve(step,fullFlags);
    if(step.distanceTo(position)>.65&&clear.distanceTo(step)<.15){landing=clear;break;}
   }
   position.copy(landing||physics.resolve(position,fullFlags));rideVisual.visible=false;
  }
  renderGroundY=position.y;
 }
 function toggleMode(){
  if(!ready)return;keys.clear();velocity.set(0,0,0);toggleBag(false);releaseMouse();interactions.closeReading();marker.visible=false;
  if(mode==='play'){
   overviewSaved={yaw,pitch,distance};mode='overview';controls.enabled=true;camera.fov=34;camera.updateProjectionMatrix();resetOverview();$('#view-toggle').innerHTML='继续游玩 <kbd>Tab</kbd>';ui.dataset.mode=mode;
  }else{mode='play';controls.enabled=false;camera.fov=55;camera.updateProjectionMatrix();$('#view-toggle').innerHTML='观赏 <kbd>Tab</kbd>';ui.dataset.mode=mode;if(overviewSaved)({yaw,pitch,distance}=overviewSaved);updateCamera(.05,true);focusCanvas();resumeMouse();}
 }
 function interact(){if(!ready||mode!=='play')return;audio.resume();const wasReading=!!interactions.getState().reading,focus=interactions.getFocused();if(interactions.interact()){if(focus)playedInteractions.add(focus.id);}if(wasReading&&!interactions.getState().reading)resumeMouse();lastBag='';focusCanvas();}
 function secondary(){if(!ready||mode!=='play')return;audio.resume();interactions.actionSecondary();lastBag='';focusCanvas();}
 $('#bag-toggle').addEventListener('click',()=>toggleBag());
 $('#view-toggle').addEventListener('click',toggleMode);$('#interact-button').addEventListener('click',interact);
 $('#sound-toggle').addEventListener('click',()=>{$('#sound-toggle').textContent=`环境声 ${audio.toggle()?'开':'关'}`;focusCanvas();});
 $('.reading .close').addEventListener('click',()=>{interactions.closeReading();focusCanvas();resumeMouse();});$('#read-next').addEventListener('click',secondary);
 $('.held').addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.heldAction==='stow')inventoryAction('stowHeld');else secondary();});
 function lookBy(dx,dy){yaw-=THREE.MathUtils.clamp(dx,-160,160)*.0035;pitch=THREE.MathUtils.clamp(pitch+THREE.MathUtils.clamp(dy,-160,160)*.003,-.23,1.04);movementYaw=yaw;manualCamera=true;}
 const canLook=()=>mode==='play'&&!bagOpen&&!interactions?.getState().reading&&playInput.lookEnabled;
 document.addEventListener('mousemove',syncMouseModifiers,true);
 document.addEventListener('pointerdown',syncMouseModifiers,true);
 document.addEventListener('wheel',syncMouseModifiers,{capture:true,passive:true});
 canvas.addEventListener('pointerdown',e=>{audio.resume();focusCanvas();if(mode!=='play'||bagOpen||interactions?.getState().reading||playInput.cursorHeld)return;if(!playInput.lookEnabled)resumeMouse();if(e.pointerType==='mouse'){if(e.button===0)captureMouse();}else{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
 // Ordinary mouse motion works even when the embedded browser declines Pointer
 // Lock. No held button, simulated capture, or edge-driven auto-turn is needed.
 canvas.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas||!canLook())return;const delta=playInput.pointerDelta(e.clientX,e.clientY);if(delta)lookBy(delta.x,delta.y);});
 canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||!drag||!canLook()||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;lookBy(dx,dy);});
 canvas.addEventListener('mouseenter',()=>{if(document.pointerLockElement!==canvas)playInput.resetPointer();});
 canvas.addEventListener('mouseleave',()=>{if(document.pointerLockElement!==canvas)playInput.resetPointer();});
 document.addEventListener('mousemove',e=>{if(canLook()&&document.pointerLockElement===canvas){const delta=playInput.lockedDelta(e.movementX,e.movementY);if(delta)lookBy(delta.x,delta.y);}});
 document.addEventListener('pointerlockchange',()=>{
  drag=null;const locked=document.pointerLockElement===canvas;playInput.resetPointer();
  // An Alt/UI unlock is deliberate; it must not become an Esc-style pause.
  // A delayed lock request must also respect a cursor or panel opened meanwhile.
  if(locked&&!canLook()){if(playInput.cursorHeld&&mode==='play'&&!bagOpen&&!interactions?.getState().reading)restoreAltLock=true;unlockMouse();}
  else if(!locked){if(wasPointerLocked&&!expectedPointerUnlock){playInput.suspendLook();keys.clear();velocity.set(0,0,0);}expectedPointerUnlock=false;}
  wasPointerLocked=locked;canvas.dataset.mouseLocked=String(locked);updateLookHint();
  if(!locked&&restoreAltLock&&!playInput.cursorHeld)finishCursorRelease();
 });
 const endDrag=()=>{drag=null;};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
 canvas.addEventListener('wheel',e=>{if(!canLook())return;e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.0025,2.8,7.8);},{passive:false});
 addEventListener('keydown',e=>{
  if((e.code==='AltLeft'||e.code==='AltRight')&&mode==='play'){
   e.preventDefault();
   holdCursor(e.code);
   return;
  }
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  if(e.code==='Tab'&&ready){if(bagOpen||interactions?.getState().reading)return;e.preventDefault();if(!e.repeat)toggleMode();return;}
  if(mode!=='play')return;
  if(bagOpen){if(e.code==='KeyB'||e.code==='Escape'){e.preventDefault();if(!e.repeat)toggleBag(false);}return;}
  const handled=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyF','KeyR','KeyB','KeyU','Escape','Home'];
  if(!handled.includes(e.code))return;e.preventDefault();audio.resume();
  canvas.dataset.lastControl=e.code;
  if(e.code==='Escape'){const wasReading=!!interactions.getState().reading;interactions.closeReading();if(wasReading)resumeMouse();else releaseMouse();return;}
  if(e.code==='KeyB'){if(!e.repeat)toggleBag();return;}
  if(e.code==='KeyF'){if(!e.repeat)interact();return;}
  if(e.code==='KeyR'){if(!e.repeat)secondary();return;}
  if(e.code==='KeyU'){if(!e.repeat)interactions.toggleUmbrella();return;}
  if(e.code==='Home'){if(!e.repeat){yaw=player.rotation.y+Math.PI;pitch=.24;distance=5.7;updateCamera(.05,true);}return;}
  if(bagOpen||interactions.getState().reading)return;
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){if(playInput.pressShift(e.code,e.repeat)){const running=playInput.sprinting;$('#sprint-mode').textContent=running?'奔跑模式':'行走模式';canvas.dataset.sprintMode=String(running);notify(running?'已切换为奔跑模式。':'已切换为行走模式。');}return;}
  if(e.code==='Space'){if(!e.repeat&&!interactions.getState().bike&&!interactions.getState().crate)jumpBuffer=.14;return;}
  keys.add(e.code);
 });
 addEventListener('keyup',e=>{
  keys.delete(e.code);playInput.releaseShift(e.code);
  if(e.code==='AltLeft'||e.code==='AltRight'){
   if(mode==='play'||playInput.cursorHeld)e.preventDefault();
   const before=playInput.cursorHeld;playInput.releaseAlt(e.code);playInput.syncAlt(e.altKey);updateCursorHold(before);
  }
 });
 const loseFocus=()=>{playInput.clearAlt();releaseMouse();};
 addEventListener('blur',loseFocus);document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();});
 function updateCamera(dt,snap=false){
  const state=interactions?.getState(),riding=state?.bike;
  indoorZoom=snap?(inside?1:0):THREE.MathUtils.damp(indoorZoom,inside?1:0,4.5,dt);
  const targetHeight=renderGroundY+(riding?1.40:1.08)+jump*.25;
  cameraFocusY=snap?targetHeight:THREE.MathUtils.damp(cameraFocusY,targetHeight,12,dt);
  cameraTarget.copy(position);cameraTarget.y=cameraFocusY;
  const d=THREE.MathUtils.lerp(distance,Math.min(distance,3.6),indoorZoom);
  const follow=cameraFollow.solve(cameraTarget,yaw,pitch,d,dt,collisionFlags({doorOpen:door.frontAmount>.65,riding,inside}),{snap,manual:manualCamera});
  camera.position.copy(follow.position);movementYaw=yaw;manualCamera=false;
  camera.lookAt(cameraTarget);
  // At very close camera distances, hide the head/body instead of filling the screen.
  const clearance=camera.position.distanceTo(cameraTarget),opacityTarget=THREE.MathUtils.smoothstep(clearance,.75,1.75);
  cameraOpacity=snap?opacityTarget:THREE.MathUtils.damp(cameraOpacity,opacityTarget,18,dt);player.visible=cameraOpacity>.015;
  for(const material of character.mesh?.material||[]){if(material.userData.cameraBase===undefined)material.userData.cameraBase={opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite};const base=material.userData.cameraBase;material.opacity=base.opacity*cameraOpacity;material.transparent=base.transparent||cameraOpacity<.995;material.depthWrite=base.depthWrite&&cameraOpacity>.98;}
 }
 function refreshHUD(state,focus){
  $('.wallet').textContent=`¥ ${yen(state.yen)}`;$('.bag-count').textContent=`背包 ${state.inventory.length+(state.umbrellaOwned?1:0)+state.wrappers||''}`;
  $('.where').textContent=mode==='overview'?'微缩观赏':state.bike?'月见町 · 骑行':inside?'雨宿り · 店内':position.z<-5.5?'月见町 · 后巷':'月见町 · 雨夜';
  $('.interact').hidden=!focus||bagOpen||!!state.reading||mode!=='play';
  if(focus){$('.interact strong').textContent=focus.prompt;$('.interact small').textContent=focus.label;$('#interact-button').setAttribute('aria-label',focus.prompt);}
  let heldText='',secondaryText='';
  if(state.bike){heldText='骑行中';secondaryText='停车下车';}
  else if(state.crate){heldText='手中 · 搬运箱';secondaryText='放下';}
  else if(focus?.id==='vending'){heldText=`贩卖机 · ${state.selectedDrink}`;secondaryText='切换饮品';}
  else if(state.held){heldText=`手中 · ${state.held.name}${state.held.paid?'':'（未付款）'}`;secondaryText=state.held.paid?'食用 / 饮用':'先到收银台结账';}
  else if(state.umbrellaEquipped){heldText=state.umbrella?'手持 · 雨伞已撑开':'手持 · 收拢的雨伞';secondaryText=state.umbrella?'合拢雨伞':'撑开雨伞';}
  else if(state.umbrellaOwned){heldText='双手空闲 · 雨伞已存入背包';}
  else{heldText='靠近物品，按 F 交互';}
  const heldHTML=`<span>${escape(heldText)}</span>${secondaryText?`<br><button data-held-action="use" ${state.held&&!state.held.paid?'disabled':''}><kbd>R</kbd> ${escape(secondaryText)}</button>`:''}${state.equipmentId&&!state.bike&&!state.crate?` <button data-held-action="stow">${state.held&&!state.held.paid?'放入购物篮':'收进背包'}</button>`:''}`;
  if($('.held').innerHTML!==heldHTML)$('.held').innerHTML=heldHTML;
  if(bagOpen)inventoryUI.update(state);
  const readingKey=JSON.stringify(state.reading);if(readingKey!==lastReading){lastReading=readingKey;$('.reading').hidden=!state.reading;if(state.reading){releaseMouse();$('.reading h2').textContent=state.reading.title;$('.reading .page').textContent=state.reading.body||state.reading.content||'雨声轻轻落在街角，翻一页，慢慢读。';$('.reading .meta span').textContent=`${(state.reading.page||0)+1} / ${state.reading.total||1}`;}}
 }
 const readyPromise=character.ready.then(()=>{
  interactions=createInteractions({THREE,scene,playerRoot:player,interiorRefs:interior,propsRefs:props,door,notify,audio:kind=>audio.play(kind),onRide,handSocket:character.sockets.rightHand,initialYen:2000,floorAt:physics.floorAt,resolveDrop:(candidate,radius)=>{const result=physics.resolve(candidate,collisionFlags({radius,riding:false}));return Math.hypot(result.x-candidate.x,result.z-candidate.z)>1?null:result;}});
  position.copy(physics.resolve(position));player.position.copy(position);ready=true;mode='play';ui.dataset.mode='play';controls.enabled=false;camera.fov=55;camera.updateProjectionMatrix();$('.loading').hidden=true;updateCamera(.05,true);focusCanvas();resumeMouse();canvas.dataset.sprintMode='false';
  notify('WASD 移动，Shift 切换奔跑；移动鼠标转向，按住 Alt 显示鼠标，F 交互。');
 }).catch(error=>{mode='overview';controls.enabled=true;ui.dataset.mode='overview';$('.loading .detail').textContent='角色加载未完成：'+String(error.message||error);$('.loading .progress').hidden=true;console.error('Character/game initialization failed',error);});
 function update(dt,time){
  elapsed=time;toastTime=Math.max(0,toastTime-dt);if(!toastTime)$('.toast').classList.remove('show');if(!ready)return;
  const state=interactions.getState();inside=isShop(position);
  const nearDoor=Math.abs(position.x-1.65)<2.2&&Math.abs(position.z-1.52)<2.3;
  door.updateDoors(dt,nearDoor);if(nearDoor&&!wasNearDoor)audio.play('door');wasNearDoor=nearDoor;
  if(mode==='play'){
   const reading=!!state.reading,locked=bagOpen||reading;
   const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
   const r=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
   const running=playInput.sprinting&&!state.crate;
   const speed=state.bike?(running?5.0:3.2):state.crate?1.0:inside?(running?2.65:1.2):(running?3.15:1.45);
   desiredVelocity.set(-Math.sin(movementYaw)*f+Math.cos(movementYaw)*r,0,-Math.cos(movementYaw)*f-Math.sin(movementYaw)*r);
   if(desiredVelocity.lengthSq()>0&&!locked)desiredVelocity.normalize().multiplyScalar(speed);else desiredVelocity.set(0,0,0);
   advanceVelocity(velocity,desiredVelocity,dt,{running,riding:state.bike,grounded:jump<=.01});
   previousPosition.copy(position);
   const next=physics.move(position,velocity.clone().multiplyScalar(dt),collisionFlags({},state));
   if(state.bike&&isShop(next)){velocity.set(0,0,0);if(time>warnUntil){notify('请把自行车停在店外，再步行进店。');warnUntil=time+4;}}
   else if(inside&&!isShop(next)&&state.basket.length){velocity.set(0,0,0);if(time>warnUntil){notify('购物篮里还有未付款商品，先到收银台结账吧。');warnUntil=time+4;}}
   else position.copy(next);
   let jumpStarted=false,landed=false,landingSpeed=0;
   if(jumpBuffer>0&&jump<=.001&&jumpPrepare<=0&&!state.bike&&!state.crate&&!locked){jumpPrepare=.065;jumpBuffer=0;}
   jumpBuffer=Math.max(0,jumpBuffer-dt);
   if(jumpPrepare>0){jumpPrepare=Math.max(0,jumpPrepare-dt);if(!jumpPrepare){jumpVelocity=4.25;jump=.003;jumpStarted=true;audio.play('jump');}}
   if(jump>0||jumpVelocity>0){jumpVelocity-=11*dt;jump+=jumpVelocity*dt;if(jump<=0){landingSpeed=-jumpVelocity;landed=true;jump=jumpVelocity=0;audio.play('land');}}
   renderGroundY=THREE.MathUtils.damp(renderGroundY,position.y,18,dt);renderGroundY=THREE.MathUtils.clamp(renderGroundY,position.y-.025,position.y+.025);
   player.position.copy(position);player.position.y=renderGroundY+jump+(state.bike?.54:0);
   const traveled=sampleDisplacement(previousPosition,position,previousActualVelocity,player.rotation.y,dt);
   const intent=traveled.speed>.12?traveled.velocity:desiredVelocity;
   const targetHeading=intent.lengthSq()>.0025?Math.atan2(intent.x,intent.z):player.rotation.y;
   const turning=advanceHeading(player.rotation.y,angularVelocity,targetHeading,dt,{running,riding:state.bike});player.rotation.y=turning.heading;angularVelocity=turning.angularVelocity;
   const motion=sampleDisplacement(previousPosition,position,previousActualVelocity,player.rotation.y,dt);previousActualVelocity.copy(motion.velocity);
   // A wall must stop the gait and footsteps, even while movement is held.
   if(Math.abs(motion.velocity.x)<Math.abs(velocity.x)*.15)velocity.x=motion.velocity.x;
   if(Math.abs(motion.velocity.z)<Math.abs(velocity.z)*.15)velocity.z=motion.velocity.z;
   character.update(dt,{time,...motion,moving:motion.speed>.04,running,turnRate:turning.turnRate,desiredTurn:turning.error,jumping:jump>.02,grounded:jump<=.02,verticalVelocity:jumpVelocity,jumpHeight:jump,jumpPreparing:jumpPrepare>0,jumpPreparation:jumpPrepare>0?1-jumpPrepare/.065:0,jumpStarted,landed,landingSpeed,groundOffset:jump>.01?0:position.y-renderGroundY,action:state.action,held:state.held,carrying:state.crate,umbrella:state.umbrella,umbrellaEquipped:state.umbrellaEquipped,umbrellaOpen:state.umbrellaOpen,riding:state.bike});
   rideVisual.visible=state.bike;if(state.bike){rideVisual.position.copy(position);rideVisual.rotation.y=player.rotation.y;}
   const footStates=character.motion?.getDebugState()?.feet||[];
   footStates.forEach((foot,i)=>{if(foot.stance&&previousFootStance[i]===false&&motion.speed>.06&&jump<=.01&&!state.bike&&!landed)audio.play(inside?'step-inside':'step-wet');previousFootStance[i]=foot.stance;});
   canvas.dataset.actualSpeed=motion.speed.toFixed(3);canvas.dataset.turnRate=turning.turnRate.toFixed(3);canvas.dataset.animationRevision='inventory-equipment-v5';canvas.dataset.cameraYaw=yaw.toFixed(3);canvas.dataset.cameraDistance=camera.position.distanceTo(cameraTarget).toFixed(3);canvas.dataset.pressedKeys=[...keys].join(',');canvas.dataset.inputVector=desiredVelocity.toArray().map(v=>v.toFixed(3)).join(',');
   updateCamera(dt);audio.update(inside);
  }else{player.visible=false;character.update(dt,{time,speed:0,moving:false,grounded:true,umbrella:state.umbrella,umbrellaEquipped:state.umbrellaEquipped,umbrellaOpen:state.umbrellaOpen,riding:state.bike});}
  interactions.update(dt,time);
  const focus=interactions.getFocused();marker.visible=mode==='play'&&!!focus&&!bagOpen&&!state.reading;
  if(marker.visible){marker.position.copy(focus.position);marker.position.y+=.20+Math.sin(time*3)*.035;marker.rotation.y=time;}
  contact.visible=mode==='play';contact.position.set(position.x,physics.floorAt(position.x,position.z)+.018,position.z);contact.material.opacity=.28/(1+jump*1.5);
  hudTime+=dt;if(hudTime>.12){hudTime=0;const latest=interactions.getState();refreshHUD(latest,focus);canvas.dataset.player=position.toArray().map(n=>n.toFixed(3)).join(',');canvas.dataset.gameMode=mode;canvas.dataset.focus=focus?.id||'';canvas.dataset.yen=String(latest.yen);canvas.dataset.basket=String(latest.basket.length);canvas.dataset.inventory=String(latest.inventory.length);canvas.dataset.door=door.frontAmount.toFixed(2);canvas.dataset.interactions=String(playedInteractions.size);canvas.dataset.jump=jump.toFixed(2);canvas.dataset.inside=String(inside);canvas.dataset.character='瓦雷莎 · 官方 MMD';}
  previousInside=inside;
 }
 return {update,ready:readyPromise,get mode(){return mode;},get isReady(){return ready;},get inside(){return inside;},get player(){return player;},get state(){return interactions?.getState();},get interactions(){return interactions;},notify};
}
