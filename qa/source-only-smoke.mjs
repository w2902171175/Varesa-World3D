// Check that the public Git candidate files work without private game assets.
import {execFileSync,spawn} from 'node:child_process';
import {copyFile,lstat,mkdir,mkdtemp,readFile,readdir,realpath,rmdir,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tempRoot=await realpath(tmpdir());
const snapshot=await mkdtemp(join(tempRoot,'ame-machi-source-check-'));
const inside=(root,path)=>{const part=relative(root,path);return part&&!isAbsolute(part)&&part!=='..'&&!part.startsWith('..'+sep)&&!part.startsWith(sep);};
if(dirname(snapshot)!==tempRoot||!inside(tempRoot,snapshot)||!snapshot.split(sep).at(-1).startsWith('ame-machi-source-check-'))throw new Error('Unsafe snapshot location');
async function run(command,args,{cwd=snapshot}={}){
 return new Promise((finish,reject)=>{
  const windowsNpm=process.platform==='win32'&&command==='npm';
  if(windowsNpm&&!args.every(arg=>/^[a-z0-9_-]+$/i.test(arg)))throw new Error('Unexpected npm argument');
  const executable=windowsNpm?join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe'):command;
  const parameters=windowsNpm?['/d','/s','/c',`npm.cmd ${args.join(' ')}`]:args;
  const child=spawn(executable,parameters,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-12000);});
  child.once('error',reject);child.once('close',code=>finish({code,output}));
 });
}
async function clearSnapshot(directory){
 if(!inside(snapshot,directory)&&directory!==snapshot)throw new Error('Cleanup outside snapshot');
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=resolve(directory,entry.name);
  if(!inside(snapshot,path))throw new Error('Cleanup entry outside snapshot');
  const info=await lstat(path);
  if(info.isDirectory()&&!info.isSymbolicLink())await clearSnapshot(path);
  else await unlink(path);
 }
 await rmdir(directory);
}
try{
 const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:sourceRoot}).toString('utf8').split('\0').filter(Boolean);
 for(const name of names){
  const from=resolve(sourceRoot,name),to=resolve(snapshot,name);
  if(!inside(sourceRoot,from)||!inside(snapshot,to))throw new Error('Git candidate escaped project');
  await mkdir(dirname(to),{recursive:true});await copyFile(from,to);
 }
 const installed=await run('npm',['ci','--no-audit','--no-fund']);
 if(installed.code!==0)throw new Error('Clean install failed:\n'+installed.output);
 const tested=await run('npm',['test']);
 if(tested.code!==0)throw new Error('Source-only tests failed:\n'+tested.output);
 const built=await run(process.execPath,['build.mjs']);
 if(built.code===0||!built.output.includes('缺少本地角色资源'))throw new Error('Missing-model build message was not clear:\n'+built.output);
 const summary=tested.output.match(/# tests \d+[\s\S]*?# duration_ms [\d.]+/)?.[0];
 console.log(`Checked ${names.length} public Git candidates in a clean snapshot.`);
 console.log(summary||'Source-only tests passed.');
 console.log('Build correctly explains the locally required official model.');
}finally{await clearSnapshot(snapshot);}
