// Optional network check. Downloads only from the original source into a
// disposable local directory and never adds character bytes to Git.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureOfficialAssets} from '../assets/character/download-official.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(join(root,'assets','character','model-manifest.json'),'utf8'));
const scratch=resolve(await mkdtemp(join(tmpdir(),'ame-official-download-')));
try{
 const result=await ensureOfficialAssets({base:scratch,manifest});
 assert.equal(result.downloaded,true);
 assert.ok(result.extracted>=manifest.requiredFiles.length);
 const model=await readFile(join(scratch,'official','瓦雷莎.pmx'));
 assert.ok(model.length>1000000);
 console.log(`Original archive verified, ${result.extracted} local files extracted, character PMX ${model.length} bytes.`);
}finally{
 const part=relative(resolve(tmpdir()),scratch);
 if(!part||part==='..'||part.startsWith('..'+sep)||part.includes(sep)||isAbsolute(part)||!part.startsWith('ame-official-download-'))throw new Error('Unsafe download-check cleanup path');
 await rm(scratch,{recursive:true,force:true});
}
