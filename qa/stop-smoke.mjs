import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {dirname,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {stopProject} from '../scripts/stop.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),qa=join(project,'qa');
const target=await mkdtemp(join(qa,'stop-check-')),other=await mkdtemp(join(qa,'stop-other-')),children=[];
const runtimeModule=pathToFileURL(join(project,'scripts/runtime-session.mjs')).href;
const worker=`import {createServer} from 'node:http';\nimport {registerSession} from ${JSON.stringify(runtimeModule)};\nconst root=process.argv[2],registered=process.argv[3]==='registered';\nconst server=createServer((req,res)=>res.end('test service'));\nawait new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));\nlet session;\nif(registered)session=await registerSession({root,kind:'launcher',onStop:async()=>{server.close();server.closeAllConnections();await session.dispose();}});\nconsole.log(JSON.stringify({pid:process.pid,port:server.address().port}));\n`;
function launch(root,name,registered){
 const child=spawn(process.execPath,[join(root,name),root,registered?'registered':'legacy'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
 return new Promise((resolveWorker,reject)=>{
  let text='';const timer=setTimeout(()=>reject(new Error('Test worker timeout')),5000);
  child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){clearTimeout(timer);resolveWorker({child,...JSON.parse(text.trim().split('\n')[0])});}});
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.stderr.on('data',chunk=>{clearTimeout(timer);reject(new Error(chunk.toString()));});
 });
}
async function cleanup(root){
 const rel=relative(qa,resolve(root));if(rel==='..'||rel.startsWith('..'+sep)||!rel.startsWith('stop-'))throw new Error('Unsafe test cleanup');
 // Delete only this freshly generated fixture after checking its absolute root.
 await rm(root,{recursive:true,force:true});
}
try{
 for(const root of [target,other]){await writeFile(join(root,'worker.mjs'),worker);await writeFile(join(root,'serve.mjs'),worker);}
 const first=await launch(target,'worker.mjs',true),second=await launch(target,'worker.mjs',true),legacy=await launch(target,'serve.mjs',false),unrelated=await launch(other,'serve.mjs',false);
 await stopProject({root:target});
 for(const item of [first,second,legacy])await assert.rejects(fetch(`http://127.0.0.1:${item.port}/`,{signal:AbortSignal.timeout(1500)}));
 assert.equal(await fetch(`http://127.0.0.1:${unrelated.port}/`).then(r=>r.text()),'test service');
 assert.match(await readFile(join(target,'游玩地址.txt'),'utf8'),/已停止/);
 assert.equal((await readdir(join(target,'.runtime','sessions'))).length,0);
 await stopProject({root:target});
 console.log(JSON.stringify({multipleInstances:'passed',legacyCleanup:'passed',unrelatedProjectPreserved:'passed',portsReleased:'passed',repeatStop:'passed'}));
}finally{
 for(const child of children)if(child.exitCode===null){const exited=new Promise(resolveExit=>child.once('close',resolveExit));child.kill();await exited;}
 await cleanup(target);await cleanup(other);
}
