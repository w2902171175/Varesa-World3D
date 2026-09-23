import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,sep,isAbsolute} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {test} from 'node:test';
import {ensureOfficialAssets,extractVerifiedZip} from '../assets/character/download-official.mjs';

const chinesePmx=Buffer.concat([Buffer.from([0xCD,0xDF,0xC0,0xD7,0xC9,0xAF]),Buffer.from('.pmx')]);
function zip(entries){
 const locals=[],directory=[];let offset=0;
 for(const {name,body,nameBytes=Buffer.from(name)}of entries){
  const data=Buffer.from(body),packed=deflateRawSync(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);
  local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);
  central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
  const payload=Buffer.concat([local,nameBytes,packed]);locals.push(payload);directory.push(Buffer.concat([central,nameBytes]));offset+=payload.length;
 }
 const index=Buffer.concat(directory),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,index,end]);
}

test('GBK filenames and nested files survive verified ZIP extraction',()=>{
 const bytes=zip([{name:'瓦雷莎.pmx',nameBytes:chinesePmx,body:'model fixture'},{name:'tex/test.png',body:'texture fixture'}]);
 const entries=extractVerifiedZip(bytes);
 assert.equal(entries.get('瓦雷莎.pmx').toString(),'model fixture');
 assert.equal(entries.get('tex/test.png').toString(),'texture fixture');
});

test('unsafe archive paths and damaged compressed data are rejected',()=>{
 assert.throws(()=>extractVerifiedZip(zip([{name:'../escape.txt',body:'bad'}])),/path traversal/);
 const damaged=zip([{name:'瓦雷莎.pmx',nameBytes:chinesePmx,body:'model fixture'}]);
 // The central directory's declared uncompressed length must match the payload.
 const central=damaged.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));damaged.writeUInt32LE(9999,central+24);
 assert.throws(()=>extractVerifiedZip(damaged),/damaged ZIP content|size/i);
});

test('first local preparation verifies the archive; later runs need no network',async t=>{
 const scratch=resolve(await mkdtemp(join(tmpdir(),'ame-character-test-')));
 t.after(async()=>{
  const rel=relative(resolve(tmpdir()),scratch);
  assert.ok(!isAbsolute(rel)&&!rel.startsWith('..')&&!rel.includes(sep)&&rel.startsWith('ame-character-test-'));
  await rm(scratch,{recursive:true,force:true});
 });
 const bytes=zip([{name:'瓦雷莎.pmx',nameBytes:chinesePmx,body:'model fixture'},{name:'tex/test.png',body:'texture fixture'}]);
 const manifest={archive:{url:'https://example.invalid/original.zip',sha256:createHash('sha256').update(bytes).digest('hex'),filenameEncoding:'gbk',filename:'varesa-official.zip'},requiredFiles:['瓦雷莎.pmx','tex/test.png']};
 let fetches=0;
 const first=await ensureOfficialAssets({base:scratch,manifest,fetchImpl:async()=>{fetches++;return new Response(bytes);},log:()=>{}});
 assert.deepEqual(first,{downloaded:true,extracted:2});assert.equal(fetches,1);
 assert.equal((await readFile(join(scratch,'official','瓦雷莎.pmx'))).toString(),'model fixture');
 assert.equal((await readFile(join(scratch,'official','tex','test.png'))).toString(),'texture fixture');
 const second=await ensureOfficialAssets({base:scratch,manifest,fetchImpl:()=>{throw new Error('must remain offline');},log:()=>{}});
 assert.deepEqual(second,{downloaded:false,extracted:0});
});
