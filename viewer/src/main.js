import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {makeContext,batchStatic,makeGlowTexture} from './helpers.js';
import {buildShop} from './building.js';
import {buildInterior} from './interior.js';
import {buildProps} from './props.js';
import {buildGround} from './ground.js';
import {makeWetRoad,makeWeather} from './weather.js';

const canvas=document.getElementById('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#131f30');
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,300);
const initialPosition=new THREE.Vector3(21,17,28), initialTarget=new THREE.Vector3(0,1.35,0);
camera.position.copy(initialPosition);
const controls=new OrbitControls(camera,canvas);controls.target.copy(initialTarget);controls.enableDamping=true;controls.dampingFactor=.065;
controls.minDistance=10;controls.maxDistance=65;controls.minPolarAngle=.10;controls.maxPolarAngle=Math.PI/2-.045;controls.rotateSpeed=.55;controls.zoomSpeed=.75;controls.panSpeed=.7;controls.screenSpacePanning=true;
controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};controls.update();
scene.add(new THREE.HemisphereLight('#8fb6d5','#62677a',.95));scene.add(new THREE.AmbientLight('#a8bcc9',.20));
const moon=new THREE.DirectionalLight('#a6c8ed',1.02);moon.position.set(-8,19,7);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-15;moon.shadow.camera.right=15;moon.shadow.camera.top=15;moon.shadow.camera.bottom=-15;moon.shadow.camera.near=1;moon.shadow.camera.far=45;moon.shadow.normalBias=.045;moon.shadow.bias=-.00008;moon.shadow.radius=3;scene.add(moon);
const rim=new THREE.DirectionalLight('#809fd6',.85);rim.position.set(8,11,-10);scene.add(rim);
const staticGroup=new THREE.Group();staticGroup.name='雨宿り・街角';scene.add(staticGroup);
const roof=new THREE.Group();roof.name='屋根';scene.add(roof);
const ctx=makeContext(staticGroup),{box,cyl,plane,add}=ctx;
// One complete, square, framed base. No element floats off its perimeter.
box(18,.68,18,0,-.35,0,'#233d50');
box(18.03,.055,18.03,0,-.035,0,'#5c7785');
box(17.92,.055,17.92,0,-.685,0,'#122c3e');
for(const x of [-8.93,8.93])box(.04,.034,17.83,x,-.16,0,'#62818c',{outline:false});
for(const z of [-8.93,8.93])box(17.83,.034,.04,0,-.16,z,'#62818c',{outline:false});
buildGround(ctx);buildShop(ctx,roof);buildInterior(ctx);const props=buildProps(ctx);
// Warm spill pools live on the pavement. Their soft edges read as light, not geometry.
const glowTexture=makeGlowTexture();
function pool(x,y,z,w,h,color,opacity){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,map:glowTexture,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);scene.add(m);return m;}
pool(-.9,.325,2.8,10,3.3,'#ffc884',.36);pool(4.8,.324,-1.5,2.5,6,'#ffe4a5',.19);pool(5.25,.072,4.8,4.8,5,'#f3c083',.32);pool(-4.65,.324,2.6,2,2,'#ef6471',.33);
const streetLight=new THREE.PointLight('#ffd591',15,11,2);streetLight.position.fromArray(props.lampPosition);scene.add(streetLight);
const vendLight=new THREE.PointLight('#f59bad',.85,4.5,2);vendLight.position.fromArray(props.vendingPosition);scene.add(vendLight);
const porch=new THREE.PointLight('#ffcf89',5.5,8,2);porch.position.set(-.4,3.15,2.15);scene.add(porch);
const backLamp=new THREE.PointLight('#66bcbc',3.5,5,2);backLamp.position.set(-6.4,2.4,-2.8);scene.add(backLamp);
// A dark seamless display surface and a contact shadow under the square plinth.
const stage=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:'#131f30'}));stage.rotation.x=-Math.PI/2;stage.position.y=-.76;scene.add(stage);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(29,29),new THREE.MeshBasicMaterial({color:'#020711',map:glowTexture,transparent:true,opacity:.9,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.748;scene.add(shadow);
batchStatic(staticGroup);batchStatic(roof);
const roofMats=new Set();roof.traverse(o=>{if(o.material&&!Array.isArray(o.material)){o.material=o.material.clone();o.material.userData.initialOpacity=o.material.opacity;roofMats.add(o.material);}});
const road=makeWetRoad(scene);const weather=makeWeather(scene);
const composer=new EffectComposer(renderer);composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.14,.38,1.1);composer.addPass(bloom);composer.addPass(new OutputPass());
let roofAlpha=1,time=0,previous=performance.now(),lastStatus=0,frameCount=0,fps=0;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function fitInitial(){const aspect=innerWidth/innerHeight;controls.maxDistance=Math.max(65,54/aspect);camera.position.copy(initialPosition);controls.target.copy(initialTarget);if(aspect<1.25)camera.position.sub(initialTarget).multiplyScalar(1.25/aspect).add(initialTarget);controls.update();}
fitInitial();
function reset(){fitInitial();camera.zoom=1;camera.updateProjectionMatrix();}
canvas.addEventListener('dblclick',reset);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('keydown',e=>{
 const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);let used=true;
 if(e.key==='ArrowLeft')s.theta-=.1;else if(e.key==='ArrowRight')s.theta+=.1;else if(e.key==='ArrowUp')s.phi=Math.max(.1,s.phi-.08);else if(e.key==='ArrowDown')s.phi=Math.min(Math.PI/2-.045,s.phi+.08);else if(e.key==='+'||e.key==='=')s.radius=Math.max(10,s.radius*.90);else if(e.key==='-')s.radius=Math.min(controls.maxDistance,s.radius/ .9);else if(e.key==='Home'){reset();e.preventDefault();return;}else used=false;
 if(used){e.preventDefault();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();}
});
let lastAspect=innerWidth/innerHeight;
addEventListener('resize',()=>{const newAspect=innerWidth/innerHeight;camera.aspect=newAspect;controls.maxDistance=Math.max(65,54/newAspect);if((lastAspect<1)!==(newAspect<1))fitInitial();lastAspect=newAspect;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
let contextLost=false;canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;});canvas.addEventListener('webglcontextrestored',()=>location.reload());
function animate(now){requestAnimationFrame(animate);if(document.hidden||contextLost){previous=now;return;}
 const dt=Math.min(.05,(now-previous)/1000);previous=now;time+=reduceMotion?0:dt;controls.update();
 // Looking down into the model lifts away the opaque roof without a UI button.
 const elevation=Math.PI/2-controls.getPolarAngle();const targetOpacity=1-THREE.MathUtils.smoothstep(elevation,.77,1.1);
 roofAlpha=THREE.MathUtils.damp(roofAlpha,targetOpacity,5,dt);roof.visible=roofAlpha>.025;
 for(const m of roofMats){m.opacity=roofAlpha*m.userData.initialOpacity;m.transparent=m.opacity<.995;m.depthWrite=m.opacity>.97;}
 road.material.uniforms.time.value=time;weather(time);composer.render();frameCount++;
 if(now-lastStatus>1500){fps=Math.round(frameCount*1000/(now-lastStatus));frameCount=0;lastStatus=now;canvas.dataset.sceneReady='true';canvas.dataset.camera=camera.position.toArray().map(v=>v.toFixed(2)).join(',');canvas.dataset.roof=roofAlpha.toFixed(2);canvas.dataset.fps=String(fps);canvas.dataset.drawCalls=String(renderer.info.render.calls);}
}
requestAnimationFrame(animate);
