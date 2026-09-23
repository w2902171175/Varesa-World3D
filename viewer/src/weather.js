import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function makeWetRoad(scene){
 const shader=Reflector.ReflectorShader;
 const uniforms=THREE.UniformsUtils.clone(shader.uniforms);uniforms.time={value:0};
 const vertexShader=shader.vertexShader.replace('varying vec4 vUv;','varying vec4 vUv; varying vec2 ground;').replace('vUv = textureMatrix','ground = (modelMatrix * vec4(position,1.0)).xz;\n vUv = textureMatrix');
 const fragmentShader=`uniform sampler2D tDiffuse;uniform float time;varying vec4 vUv;varying vec2 ground;
 #include <common>
 #include <logdepthbuf_pars_fragment>
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 void main(){
 #include <logdepthbuf_fragment>
 vec4 q=vUv;float n=noise(ground*1.8);q.xy+=vec2(sin(ground.y*55.+time*.8),sin(ground.x*46.-time*.45))*.00065*q.w;
 vec3 reflection=texture2DProj(tDiffuse,q).rgb*.4;
 for(int i=0;i<3;i++){vec4 s=q;s.x+=float(i-1)*.0014*q.w;s.y+=float(i-1)*.0020*q.w;reflection+=texture2DProj(tDiffuse,s).rgb*.2;}
 float puddle=smoothstep(.28,.7,noise(ground*.52));
 vec3 road=vec3(.026,.044,.067)+vec3(noise(ground*260.)*.014);
 vec3 wet=mix(road,reflection,.28+.34*puddle);
 wet+=vec3(.008,.014,.018)*n;
 gl_FragColor=vec4(wet,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`;
 const road=new Reflector(new THREE.PlaneGeometry(17.98,17.98),{textureWidth:1024,textureHeight:1024,clipBias:.003,color:0x546678,shader:{uniforms,vertexShader,fragmentShader}});
 road.rotation.x=-Math.PI/2;road.position.y=.045;scene.add(road);return road;
}

export function makeWeather(scene){
 let seed=71931;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const count=930,positions=new Float32Array(count*6),speeds=new Float32Array(count*2),phases=new Float32Array(count*2),lengths=new Float32Array(count*2),floors=new Float32Array(count*2);
 const floorAt=(x,z)=>x>-6.05&&x<4.05&&z>-5.84&&z<1.86?4.94:(x>-6.1&&x<4.1&&z>=1.86&&z<2.2)?3.67:((z>1.4&&z<3.7&&x>-5.9&&x<5.8)||(x>3.7&&x<5.8&&z>-6.4&&z<3.7))?.32:.062;
 for(let i=0;i<count;i++){
  const x=rand()*17.5-8.75,z=rand()*17.5-8.75,s=5.6+rand()*3.4,p=rand(),len=.15+rand()*.23;
  for(let j=0;j<2;j++){const k=i*2+j;positions[k*3]=x;positions[k*3+1]=j;positions[k*3+2]=z;speeds[k]=s;phases[k]=p;lengths[k]=len;floors[k]=floorAt(x,z);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));for(const [name,a] of [['speed',speeds],['phase',phases],['len',lengths],['floorY',floors]])geo.setAttribute(name,new THREE.BufferAttribute(a,1));
 const material=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`attribute float speed;attribute float phase;attribute float len;attribute float floorY;uniform float time;varying float alpha;
 void main(){vec3 p=position;float top=10.;float travel=top-floorY;float y=top-mod(phase*travel+time*speed,travel);p.x+=position.y*.05;p.y=y+position.y*len;alpha=.085+.095*phase;alpha*=1.-smoothstep(7.5,10.,y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying float alpha;void main(){gl_FragColor=vec4(.56,.74,.84,alpha);}`,transparent:true,depthWrite:false,blending:THREE.NormalBlending});
 const rain=new THREE.LineSegments(geo,material);rain.frustumCulled=false;scene.add(rain);
 const n=82,rg=new THREE.RingGeometry(.91,1,32);rg.rotateX(-Math.PI/2);
 const rings=new THREE.InstancedMesh(rg,new THREE.MeshBasicMaterial({color:'#9cc9d1',transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide}),n);
 const drops=[];for(let i=0;i<n;i++){
  let x,z,f;do{x=rand()*17.4-8.7;z=rand()*17.4-8.7;f=floorAt(x,z);}while(f>1);
  drops.push({x,z,y:f+.017,phase:rand(),duration:1.1+rand()*.9,radius:.09+rand()*.17});
 }
 scene.add(rings);const dummy=new THREE.Object3D();
 return function update(t){material.uniforms.time.value=t;drops.forEach((d,i)=>{const progress=(t/d.duration+d.phase)%1;dummy.position.set(d.x,d.y,d.z);dummy.scale.setScalar(d.radius*(.2+progress));dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);rings.setColorAt(i,new THREE.Color('#9cc9d1').multiplyScalar((1-progress)*.9));});rings.instanceMatrix.needsUpdate=true;if(rings.instanceColor)rings.instanceColor.needsUpdate=true;};
}
