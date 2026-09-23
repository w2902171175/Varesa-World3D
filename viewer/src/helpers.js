import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ramp = new THREE.DataTexture(new Uint8Array([82,142,199,244]),4,1,THREE.RedFormat);
ramp.minFilter=THREE.NearestFilter;ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
const materialCache=new Map(), edgeMaterial=new THREE.LineBasicMaterial({color:0x11253a,transparent:true,opacity:.25});
const boxGeo=new THREE.BoxGeometry(1,1,1);
const edges=new THREE.EdgesGeometry(boxGeo);

export function makeContext(group){
  function mat(color, opts={}){
    if(color?.isMaterial)return color;
    const {roughness,metalness,rotationX,rotationY,rotationZ,outline,radialSegments,...remaining}=opts;
    const valid=Object.fromEntries(Object.entries(remaining).filter(([,v])=>v!==undefined));
    const key=JSON.stringify([color,valid]);
    if(materialCache.has(key))return materialCache.get(key);
    const m=new THREE.MeshToonMaterial({color,gradientMap:ramp,...valid});
    if(valid.opacity!==undefined&&valid.opacity<1){m.transparent=true;m.depthWrite=false;}
    materialCache.set(key,m);return m;
  }
  function add(mesh){group.add(mesh);return mesh;}
  function place(geometry,x,y,z,color,opts={}){
    const m=new THREE.Mesh(geometry,mat(color,opts));m.position.set(x,y,z);
    m.castShadow=!m.material.transparent;m.receiveShadow=true;
    if(opts.rotationX)m.rotation.x=opts.rotationX;if(opts.rotationY)m.rotation.y=opts.rotationY;if(opts.rotationZ)m.rotation.z=opts.rotationZ;
    return add(m);
  }
  function box(w,h,d,x,y,z,color,opts={}){
    const m=place(boxGeo,x,y,z,color,opts);m.scale.set(w,h,d);
    if(opts.outline!==false&&Math.max(w,h,d)>.55&&Math.min(w,h,d)>.045&&!opts.transparent&&!(opts.opacity<1))m.add(new THREE.LineSegments(edges,edgeMaterial));
    return m;
  }
  function cyl(rt,rb,h,x,y,z,color,opts={}){return place(new THREE.CylinderGeometry(rt,rb,h,opts.radialSegments||16),x,y,z,color,{...opts,radialSegments:undefined});}
  function sphere(r,x,y,z,color,opts={}){return place(new THREE.SphereGeometry(r,16,10),x,y,z,color,opts);}
  function tube(points,r,color,opts={}){
    const pts=points.map(p=>p.isVector3?p:new THREE.Vector3(...p));
    const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');
    return place(new THREE.TubeGeometry(curve,Math.max(12,points.length*8),r,6,false),0,0,0,color,opts);
  }
  function plane(w,h,x,y,z,color,opts={}){return place(new THREE.PlaneGeometry(w,h),x,y,z,color,{side:THREE.DoubleSide,...opts});}
  function label(text,w,h,x,y,z,opts={}){
    const c=document.createElement('canvas');c.width=Math.min(2048,Math.max(256,Math.round(w/h*256)));c.height=256;
    const g=c.getContext('2d');
    if(opts.bg&&opts.bg!=='transparent'){g.fillStyle=opts.bg;g.fillRect(0,0,c.width,c.height);}
    const lines=String(text).split('\n');g.fillStyle=opts.fg||'#eaf5eb';g.textAlign='center';g.textBaseline='middle';
    const fontSize=opts.fontSize||Math.min(180/lines.length,c.width/(Math.max(...lines.map(s=>s.length))*.75));
    g.font=opts.font&&/\d+px/.test(opts.font)?opts.font:`${opts.weight||700} ${fontSize}px ${opts.font||'"Yu Gothic", "Meiryo", sans-serif'}`;
    lines.forEach((line,i)=>g.fillText(line,c.width/2,128+(i-(lines.length-1)/2)*fontSize*1.2,c.width*.93));
    if(opts.border){g.strokeStyle=opts.border;g.lineWidth=5;g.strokeRect(5,5,c.width-10,c.height-10);}
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    const material=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,opacity:opts.opacity??1});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z);
    mesh.rotation.set(opts.rotationX||0,opts.rotationY||0,opts.rotationZ||0);return add(mesh);
  }
  return {THREE,group,mat,add,box,cyl,sphere,tube,plane,label};
}

// Bake static geometry by material. Aisles contain hundreds of individual products,
// but the finished scene submits only a small number of draw calls.
export function batchStatic(group){
  group.updateMatrixWorld(true);
  const meshes=new Map(),lines=new Map(), originals=[];
  group.traverse(o=>{
    if((o.isMesh||o.isLineSegments)&&!Array.isArray(o.material)&&!o.isInstancedMesh){
      const bins=o.isLineSegments?lines:meshes,key=o.material.uuid;
      if(!bins.has(key))bins.set(key,{material:o.material,geos:[],cast:false,receive:false});
      const b=bins.get(key),geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);b.geos.push(geo);b.cast ||=o.castShadow;b.receive ||=o.receiveShadow;originals.push(o);
    }
  });
  originals.forEach(o=>o.removeFromParent());
  for(const [bins,isLine] of [[meshes,false],[lines,true]])for(const b of bins.values()){
    // Materials made by a helper share compatible geometry attributes.
    const compatible=new Map();
    for(const g of b.geos){const sig=Object.keys(g.attributes).sort().join(',')+!!g.index;if(!compatible.has(sig))compatible.set(sig,[]);compatible.get(sig).push(g);}
    for(const geos of compatible.values()){
      const merged=mergeGeometries(geos,false);if(!merged)continue;
      const o=isLine?new THREE.LineSegments(merged,b.material):new THREE.Mesh(merged,b.material);o.castShadow=b.cast;o.receiveShadow=b.receive;group.add(o);
      geos.forEach(g=>g.dispose());
    }
  }
}

export function makeGlowTexture(){
 const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
 const a=g.createRadialGradient(64,64,0,64,64,64);a.addColorStop(0,'rgba(255,255,255,.55)');a.addColorStop(.2,'rgba(255,255,255,.21)');a.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=a;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
