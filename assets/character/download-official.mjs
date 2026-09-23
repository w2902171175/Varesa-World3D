import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const baseDefault=dirname(fileURLToPath(import.meta.url));
const MAX_ARCHIVE=20*1024*1024,MAX_ENTRY=6*1024*1024,MAX_EXTRACTED=20*1024*1024;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

function checkedEntryName(name){
 if(!name||name.startsWith('/')||name.includes('\\')||name.includes(':')||/[\x00-\x1f\x7f]/.test(name))throw new Error('Official archive contains an unsafe path');
 const parts=name.split('/'),last=parts.at(-1);
 if(parts.some((part,index)=>part==='.'||part==='..'||(!part&&index<parts.length-1))||(!last&&!name.endsWith('/')))throw new Error('Official archive contains path traversal');
 return name;
}

export function extractVerifiedZip(bytes,{encoding='gbk'}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length>MAX_ARCHIVE||bytes.length<22)throw new Error('Invalid official archive size');
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw new Error('Invalid ZIP directory');
 const count=bytes.readUInt16LE(end+10),directorySize=bytes.readUInt32LE(end+12),directoryOffset=bytes.readUInt32LE(end+16);
 if(!count||count>100||directoryOffset+directorySize>end)throw new Error('Invalid ZIP entry list');
 const files=new Map();let cursor=directoryOffset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('Damaged ZIP index');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10);
  const compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24);
  const nameSize=bytes.readUInt16LE(cursor+28),extraSize=bytes.readUInt16LE(cursor+30),commentSize=bytes.readUInt16LE(cursor+32);
  const localOffset=bytes.readUInt32LE(cursor+42),next=cursor+46+nameSize+extraSize+commentSize;
  if(next>bytes.length||compressed>MAX_ARCHIVE||length>MAX_ENTRY)throw new Error('Invalid ZIP entry size');
  const charset=(flags&0x800)?'utf-8':encoding;
  const name=checkedEntryName(new TextDecoder(charset,{fatal:true}).decode(bytes.subarray(cursor+46,cursor+46+nameSize)));
  if(files.has(name))throw new Error('Duplicate ZIP entry');
  cursor=next;
  if(name.endsWith('/'))continue;
  if(localOffset+30>bytes.length||bytes.readUInt32LE(localOffset)!==0x04034b50)throw new Error('Damaged ZIP file header');
  const dataStart=localOffset+30+bytes.readUInt16LE(localOffset+26)+bytes.readUInt16LE(localOffset+28);
  if(dataStart+compressed>bytes.length)throw new Error('Truncated ZIP file');
  const encoded=bytes.subarray(dataStart,dataStart+compressed);
  const content=method===0?Buffer.from(encoded):method===8?inflateRawSync(encoded,{maxOutputLength:MAX_ENTRY}):null;
  if(!content||content.length!==length)throw new Error('Unsupported or damaged ZIP content');
  total+=content.length;if(total>MAX_EXTRACTED)throw new Error('ZIP extraction limit exceeded');
  files.set(name,content);
 }
 if(cursor!==directoryOffset+directorySize)throw new Error('ZIP directory length mismatch');
 return files;
}

async function missingRequired(official,required){
 const missing=[];
 for(const name of required){
  try{const item=await lstat(join(official,name));if(!item.isFile()||item.isSymbolicLink()||item.size===0)missing.push(name);}
  catch(error){if(error.code==='ENOENT')missing.push(name);else throw error;}
 }
 return missing;
}

export async function ensureOfficialAssets({base=baseDefault,manifest,fetchImpl=fetch,log=console.log}={}){
 const metadata=manifest||JSON.parse(await readFile(join(base,'model-manifest.json'),'utf8'));
 const official=join(base,'official'),missing=await missingRequired(official,metadata.requiredFiles);
 if(!missing.length)return {downloaded:false,extracted:0};
 try{const item=await lstat(official);if(!item.isDirectory()||item.isSymbolicLink())throw new Error('official/ must be a normal directory');}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const archive=join(base,metadata.archive.filename);let bytes,downloaded=false;
 try{bytes=await readFile(archive);if(sha256(bytes)!==metadata.archive.sha256.toUpperCase())throw new Error('Cached official archive checksum mismatch; keep this file for manual review');}
 catch(error){
  if(error.code!=='ENOENT')throw error;
  log('Downloading the original Varesa archive from its official distribution URL...');
  const response=await fetchImpl(metadata.archive.url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok||!response.body)throw new Error(`Official archive download failed: HTTP ${response.status}`);
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_ARCHIVE)throw new Error('Official archive exceeds size limit');
  const chunks=[];let total=0;
  for await(const chunk of response.body){total+=chunk.length;if(total>MAX_ARCHIVE)throw new Error('Official archive exceeds size limit');chunks.push(Buffer.from(chunk));}
  bytes=Buffer.concat(chunks,total);
  if(sha256(bytes)!==metadata.archive.sha256.toUpperCase())throw new Error('Official archive SHA256 mismatch');
  try{await writeFile(archive,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||sha256(await readFile(archive))!==metadata.archive.sha256.toUpperCase())throw error;}
  downloaded=true;
 }
 const contents=extractVerifiedZip(bytes,{encoding:metadata.archive.filenameEncoding});
 for(const name of metadata.requiredFiles)if(!contents.has(name))throw new Error('Official archive is missing a required character file: '+name);
 await mkdir(official,{recursive:true});
 let extracted=0;
 for(const [name,content]of contents){
  const target=resolve(official,name);
  if(!target.startsWith(resolve(official)+sep))throw new Error('ZIP entry escaped the character directory');
  await mkdir(dirname(target),{recursive:true});
  try{await writeFile(target,content,{flag:'wx'});extracted++;}
  catch(error){if(error.code!=='EEXIST')throw error;}
 }
 const remaining=await missingRequired(official,metadata.requiredFiles);
 if(remaining.length)throw new Error('Character files remain incomplete: '+remaining.join(', '));
 log(`Verified and prepared ${extracted} original model files locally.`);
 return {downloaded,extracted};
}
