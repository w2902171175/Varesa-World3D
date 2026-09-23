import * as THREE from 'three';
import {MMDLoader} from 'three/addons/loaders/MMDLoader.js';
import {MMDParser} from 'three/addons/libs/mmdparser.module.js';
import {modelBase64,textureURLs} from '../assets/character/embedded.js';
import {createMotionController} from './character-motion.js';

// Original official Varesa MMD mesh, provided by miHoYo and adapted by 观海.
// Source/readme are preserved in assets/character. This local adaptation adds
// animation to the existing rig; it does not substitute a generated character.
export function createCharacter(scene) {
  const root=new THREE.Group();root.name='瓦雷莎 / Varesa';
  root.userData.height=1.72;root.userData.radius=.27;root.userData.character='Varesa';
  root.userData.source='miHoYo / 观海 · official Genshin 5.5 MMD';
  const visual=new THREE.Group();root.add(visual);scene.add(root);
  const sockets={leftHand:new THREE.Group(),rightHand:new THREE.Group()};
  sockets.leftHand.name='Varesa left hand';sockets.rightHand.name='Varesa right hand';
  let mesh=null,scale=1,groundOffset=0,motion=null;
  const ready=new Promise((resolve,reject)=>{
    try {
      const bytes=Uint8Array.from(atob(modelBase64),c=>c.charCodeAt(0));
      const data=new MMDParser.Parser().parsePmx(bytes.buffer,true);
      // Upload just the expressions used by the scene, instead of 66 full-size
      // redundant morph targets, to leave GPU memory for the street reflections.
      const expressions=new Set(['まばたき','笑い','にこり','口角上げ','もぐもぐ','あ']);
      data.morphs=data.morphs.filter(m=>expressions.has(m.name));
      data.metadata.morphCount=data.morphs.length;
      const manager=new THREE.LoadingManager();
      manager.setURLModifier(url=>{
        if(url.startsWith('data:'))return url;
        const key=decodeURIComponent(url).replaceAll('\\','/').replace(/^\.\//,'');
        if(textureURLs[key])return textureURLs[key];
        throw new Error('Missing embedded Varesa texture: '+key);
      });
      manager.onError=url=>reject(new Error('Varesa texture could not be decoded: '+url.slice(0,100)));
      manager.onLoad=()=>{
        root.userData.ready=true;
        for(const material of mesh.material){
          if(material.map)material.map.anisotropy=4;
          material.needsUpdate=true;
        }
        resolve(root);
      };
      const loader=new MMDLoader(manager);
      mesh=loader.meshBuilder.build(data,'');mesh.name='Official Varesa skinned model';
      mesh.geometry.computeBoundingBox();
      const bounds=mesh.geometry.boundingBox;
      scale=root.userData.height/(bounds.max.y-bounds.min.y);
      groundOffset=-bounds.min.y*scale;
      mesh.scale.setScalar(scale);mesh.position.y=groundOffset;
      mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=false;
      // The optional luchadora mask is hidden by the original material's alpha.
      for(const material of mesh.material){
        material.side=THREE.DoubleSide;
        material.depthWrite=material.opacity>.98;
        if(material.opacity===0)material.visible=false;
      }
      visual.add(mesh);
      const bones=Object.fromEntries(mesh.skeleton.bones.map(b=>[b.name,b]));
      for(const [name,boneName] of [['leftHand','左手首'],['rightHand','右手首']]){
        const socket=sockets[name];bones[boneName].add(socket);
        socket.position.set(0,-.43,.06);socket.scale.setScalar(1/scale);
      }
      motion=createMotionController({mesh,root,visual,scale,groundOffset,sockets});
      root.userData.modelScale=scale;
    } catch(error){root.userData.error=String(error);reject(error);}
  });

  return {root,ready,update:(dt,state)=>motion?.update(dt,state),sockets,get mesh(){return mesh;},get motion(){return motion;},height:1.72};
}
