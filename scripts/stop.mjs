import {readdir,readFile,access,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {requestSessionStop} from './runtime-session.mjs';

const PROJECT_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runFile=promisify(execFile);
const sameRoot=(a,b)=>typeof a==='string'&&resolve(a).toLowerCase()===resolve(b).toLowerCase();
export async function stopProject({root=PROJECT_ROOT,log=console.log,legacy=true}={}){
 root=resolve(root);const sessionsDir=join(root,'.runtime','sessions');
 let entries=[];try{entries=await readdir(sessionsDir,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
 const acknowledged=[],records=[];
 for(const entry of entries){
  if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
  const path=join(sessionsDir,entry.name);
  try{
   const json=await readFile(path,'utf8');if(json.length>16384)continue;
   const record=JSON.parse(json);if(!sameRoot(record.root,root))continue;
   records.push(path);
   if(await requestSessionStop(record)){acknowledged.push(record.pid);log(`正在停止${record.kind==='launcher'?'游戏实例及其分享':'本地游戏服务'}（PID ${record.pid}）…`);}
  }catch(error){log(`会话记录 ${entry.name} 未能连接，将继续检查本项目残留进程。`);}
 }
 // Give acknowledged launchers time to stop their own children and flush logs.
 const deadline=Date.now()+3000;
 while(acknowledged.length&&Date.now()<deadline){
  const remaining=await Promise.all(records.map(path=>access(path).then(()=>true,()=>false)));
  if(!remaining.some(Boolean))break;await delay(100);
 }
 let legacyResults=[];
 if(legacy&&process.platform==='win32'){
  const powershell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  let stdout;
  try{({stdout}=await runFile(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(PROJECT_ROOT,'scripts','project-processes.ps1'),'-ProjectRoot',root,'-Stop'],{windowsHide:true,encoding:'utf8',maxBuffer:1024*1024}));}
  catch(error){
   if(error.stdout?.trim().startsWith('[')||error.stdout?.trim().startsWith('{'))stdout=error.stdout;
   else throw new Error('遗留进程检查失败：'+(error.stderr?.trim()||error.message));
  }
  const parsed=stdout.trim()?JSON.parse(stdout.replace(/^\uFEFF/,'')):[];legacyResults=Array.isArray(parsed)?parsed:[parsed];
  for(const item of legacyResults){if(item.status==='stopped')log(`已停止${item.kind==='tunnel'?'公网隧道':'遗留游戏服务'}（PID ${item.pid}）。`);}
 }
 const failed=legacyResults.filter(item=>item.status==='failed');
 if(failed.length)throw new Error(failed.map(item=>`PID ${item.pid}：${item.message||'未能停止'}`).join('\n'));
 const stoppedCount=acknowledged.length+legacyResults.filter(item=>item.status==='stopped').length;
 if(stoppedCount)log('本项目的游戏服务和公网分享已停止。');else log('当前没有检测到本项目运行中的服务。');
 await writeFile(join(root,'游玩地址.txt'),'本项目的服务已停止。请重新运行 start.bat 获取新的游玩地址。\n','utf8');
 log('重新运行 start.bat 即可再次启动。已经载入的游戏页面可自行关闭。');
 return {acknowledged,legacyResults};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const invalid=process.argv.slice(2).filter(arg=>arg!=='--quiet');
 if(invalid.length){console.error('未知参数：'+invalid.join(' '));process.exitCode=1;}
 else stopProject().catch(error=>{console.error('停止未全部完成：'+(error.stderr||error.message));process.exitCode=1;});
}
