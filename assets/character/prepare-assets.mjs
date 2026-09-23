// Rebuild the embedded, offline-only model from the unmodified official download.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureOfficialAssets} from './download-official.mjs';
const base=path.dirname(fileURLToPath(import.meta.url));
const official=path.join(base,'official');
await ensureOfficialAssets({base});
const model=fs.readdirSync(official).find(n=>n.endsWith('.pmx')&&fs.statSync(path.join(official,n)).size>1000000);
if(!model)throw new Error('未找到官方角色 PMX 文件。请确认模型文件位于 assets/character/official/ 目录。');
const textures=['tex/颜.png','skin.bmp','tex/髮.png','hair.bmp','tex/体.png','toon_defo.bmp','tex/肌.png','tex/面具.png','tex/spa_h.png','sph/hair_s.bmp'];
const map=Object.fromEntries(textures.map(n=>{
 const file=path.join(official,n);if(!fs.existsSync(file))throw new Error('角色贴图缺失：'+n+'。请完整解压官方模型资源。');
 return [n,'data:image/'+(n.endsWith('.bmp')?'bmp':'png')+';base64,'+fs.readFileSync(file).toString('base64')];
}));
const out='// Official Varesa model: miHoYo; MMD adaptation: 观海. See SOURCE.md and original readme.\n'+
  'export const modelBase64='+JSON.stringify(fs.readFileSync(path.join(official,model)).toString('base64'))+';\n'+
  'export const textureURLs='+JSON.stringify(map)+';\n';
fs.writeFileSync(path.join(base,'embedded.js'),out);
console.log('Embedded character assets: '+(Buffer.byteLength(out)/1024/1024).toFixed(2)+' MiB');
