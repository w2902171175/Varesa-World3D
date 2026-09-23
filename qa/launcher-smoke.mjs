import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),children=[];
function launch(args,selection){
 const child=spawn(process.execPath,[join(root,'scripts/start.mjs'),...args,'--no-open'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
 children.push(child);let output='',selected=false;
 const exited=new Promise(resolveExit=>child.once('close',(code,signal)=>resolveExit({code,signal})));
 const ready=new Promise((resolveReady,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Launcher timeout: '+output)),10000);
  const consume=chunk=>{
   output+=chunk.toString();
   if(selection!==undefined&&!selected&&output.includes('选择模式 [')){selected=true;child.stdin.write(selection+'\n');}
   if(output.includes('地址已保存到：')){clearTimeout(timer);const port=Number(output.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1]);resolveReady({port});}
  };
  child.stdout.on('data',consume);child.stderr.on('data',consume);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',()=>{clearTimeout(timer);reject(new Error('Launcher exited before ready: '+output));});
 });
 return {child,ready,exited,get output(){return output;}};
}
async function stop(launcher){
 launcher.child.stdin.write('\n');
 let timer;try{
  const result=await Promise.race([launcher.exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Stop timeout: '+launcher.output)),5000);})]);
  assert.equal(result.code,0,launcher.output);
 }finally{clearTimeout(timer);}
}
try{
 const first=launch([],'');const a=await first.ready;
 assert.match(first.output,/运行模式：仅本机游玩/);
 assert.doesNotMatch(first.output,/正在生成外网游玩网址|局域网网址：/);
 const aHealth=await fetch(`http://127.0.0.1:${a.port}/__game_health`).then(r=>r.json());
 assert.equal(aHealth.app,'ame-machi-miniature');
 const head=await fetch(`http://127.0.0.1:${a.port}/`+encodeURIComponent('瓦雷莎·雨夜便利店.html'),{method:'HEAD'});
 assert.equal(head.status,200);assert.match(head.headers.get('content-type'),/text\/html/);
 const second=launch(['--lan','--port',String(a.port)]);const b=await second.ready;
 assert.match(second.output,/运行模式：局域网分享/);
 assert.notEqual(a.port,b.port);
 await stop(first);
 await assert.rejects(fetch(`http://127.0.0.1:${a.port}/__game_health`));
 assert.equal((await fetch(`http://127.0.0.1:${b.port}/__game_health`).then(r=>r.json())).app,'ame-machi-miniature');
 assert.match(await readFile(join(root,'游玩地址.txt'),'utf8'),new RegExp(`127\\.0\\.0\\.1:${b.port}`));
 await stop(second);
 await assert.rejects(fetch(`http://127.0.0.1:${b.port}/__game_health`));
 assert.match(await readFile(join(root,'游玩地址.txt'),'utf8'),/本次运行已停止/);
 console.log(JSON.stringify({firstPort:a.port,secondPort:b.port,defaultLocalMenu:'passed',gameHttp:'passed',portFallback:'passed',enterShutdown:'passed',separateInstances:'passed',addressOwnership:'passed'}));
}finally{for(const child of children)if(child.exitCode===null)child.kill();}
