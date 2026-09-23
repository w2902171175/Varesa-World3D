import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect} from 'node:net';
import {lookup} from 'node:dns/promises';
import {createInterface} from 'node:readline/promises';
import {createGameServer} from '../serve.mjs';
import {ensureCloudflared,startQuickTunnel} from './tunnel.mjs';
import {registerSession} from './runtime-session.mjs';

const PROJECT_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function parseOptions(args){
 const options={mode:null,port:4180,open:true};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(['--public','--lan','--local'].includes(arg)){
   if(options.mode)throw new Error('请只选择一种启动方式。');options.mode=arg.slice(2);
  }else if(arg==='--no-open')options.open=false;
  else if(arg==='--port'){
   const value=args[++i];if(!/^\d+$/.test(value||'')||Number(value)>65535)throw new Error('端口必须是 0 到 65535 的整数。');options.port=Number(value);
  }else throw new Error(`未知参数：${arg}`);
 }
 return options;
}
export function lanAddresses(port,interfaces=networkInterfaces()){
 const rank=ip=>ip.startsWith('192.168.')?0:ip.startsWith('10.')?1:/^172\.(1[6-9]|2\d|3[01])\./.test(ip)?2:3;
 const ips=[...new Set(Object.values(interfaces).flat().filter(item=>item&&!item.internal&&(item.family==='IPv4'||item.family===4)&&!item.address.startsWith('169.254.')&&!/^198\.(18|19)\./.test(item.address)).map(item=>item.address))];
 return ips.sort((a,b)=>rank(a)-rank(b)).map(ip=>`http://${ip}:${port}`);
}
async function availableServer(options){
 for(let attempt=0;attempt<20;attempt++){
  const port=options.port===0?0:options.port+attempt;if(port>65535)break;
  // Windows can accept a wildcard listener while another service already owns
  // the same loopback port. Probe it before binding so the browser reaches us.
  if(port&&await new Promise(resolveProbe=>{
   const socket=connect({host:'127.0.0.1',port});
   const done=value=>{socket.destroy();resolveProbe(value);};
   socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(500,()=>done(true));
  }))continue;
  try{return await createGameServer({...options,port});}
  catch(error){if(error.code!=='EADDRINUSE')throw error;}
 }
 throw new Error('附近端口都被占用，可用 start.bat --port 4300 指定其他端口。');
}
function openBrowser(url){
 const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 child.once('error',()=>console.log('未能自动打开浏览器，请复制上方本机地址。'));child.unref();
}
async function canResolvePublicUrl(url){
 let timer;
 try{return await Promise.race([lookup(new URL(url).hostname).then(()=>true,()=>false),new Promise(resolveDns=>{timer=setTimeout(()=>resolveDns(false),2500);})]);}
 finally{clearTimeout(timer);}
}
export async function main(args=process.argv.slice(2)){
 if(Number(process.versions.node.split('.')[0])<20)throw new Error('请安装 Node.js 20 或更新的 LTS 版本：https://nodejs.org/');
 const options=parseOptions(args),runtimeRoot=join(PROJECT_ROOT,'.runtime'),addressFile=join(PROJECT_ROOT,'游玩地址.txt');
 await access(join(PROJECT_ROOT,'Output','瓦雷莎·雨夜便利店.html'));
 const sessionId=randomUUID(),abort=new AbortController();
 const input=createInterface({input:process.stdin,output:process.stdout});
 let server,tunnel,session,stopped=false,addressText='',started=false,addressWrite=Promise.resolve();
 function saveAddresses(text){
  if(stopped)return addressWrite;
  addressText=text;addressWrite=addressWrite.then(()=>writeFile(addressFile,text,'utf8'));
  return addressWrite;
 }
 async function updateOwnedStatus(text){
  try{await addressWrite;if(!stopped&&await readFile(addressFile,'utf8')===addressText)await saveAddresses(text);}
  catch(error){console.error('地址文件更新失败：'+error.message);}
 }
 async function stop(){
  if(stopped)return;stopped=true;abort.abort();tunnel?.stop();input.close();
  process.stdin.pause();process.stdin.unref?.();
  for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.off(name,stopFromSignal);
  if(server){server.close();server.closeAllConnections();}
  await session?.dispose();
  if(addressText){try{await addressWrite;if(await readFile(addressFile,'utf8')===addressText)await writeFile(addressFile,'本次运行已停止。请重新运行 start.bat 获取新的游玩地址。\n','utf8');}catch{}}
  console.log('\n本次游戏服务已停止。');
 }
 const stopFromSignal=()=>{void stop();};
 input.on('close',stopFromSignal);
 for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,stopFromSignal);
 const killChildOnExit=()=>tunnel?.stop();process.on('exit',killChildOnExit);
 try{
  session=await registerSession({root:PROJECT_ROOT,kind:'launcher',onStop:stop});
  if(stopped){await session.dispose();return;}
  console.log('\n  瓦雷莎 · 雨夜便利店\n');
  if(!options.mode){
   console.log('  1  仅本机游玩（自己玩，默认）\n  2  局域网分享（同一 Wi-Fi / 局域网）\n  3  临时公网分享（朋友在外网也能打开）\n');
   const selection=(await input.question('选择模式 [1/2/3，回车选 1]：')).trim();
   if(selection&&!['1','2','3'].includes(selection))throw new Error('请选择 1、2 或 3。');
   options.mode=selection==='3'?'public':selection==='2'?'lan':'local';
  }
  if(stopped)return;
  input.on('line',()=>{if(started)void stop();});
  server=await availableServer({root:join(PROJECT_ROOT,'Output'),host:options.mode==='lan'?'0.0.0.0':'127.0.0.1',port:options.port,instanceId:sessionId});
  if(stopped){server.close();return;}
  started=true;
  const port=server.address().port,localUrl=`http://127.0.0.1:${port}`;
  const health=await fetch(localUrl+'/__game_health',{signal:AbortSignal.timeout(5000)}).then(response=>response.json());
  if(stopped)return;
  if(health.app!=='ame-machi-miniature'||health.instanceId!==sessionId)throw new Error('启动校验失败，请换一个端口重试。');
  const modeLabel={local:'仅本机游玩',lan:'局域网分享',public:'临时公网分享'}[options.mode];
  console.log(`运行模式：${modeLabel}${options.mode==='local'?'（只有这台电脑可以访问）':''}`);
  console.log(`本机游玩：${localUrl}`);
  if(options.port&&port!==options.port)console.log(`原端口正在使用，本次自动使用 ${port}。`);
  let base=`瓦雷莎 · 雨夜便利店\n运行模式：${modeLabel}\n本机游玩：${localUrl}\n`;
  if(options.mode==='lan'){
   const urls=lanAddresses(port);
   for(const url of urls)console.log(`局域网网址：${url}`);
   console.log('朋友需要在同一 Wi-Fi / 局域网。若无法连接，请在 Windows 防火墙提示中允许专用网络访问。');
   if(!urls.length)console.log('未检测到局域网 IPv4 地址，当前仅能本机游玩。');
   base+=urls.map(url=>'局域网游玩：'+url+'\n').join('')+'仅同一局域网有效；外网朋友请选择公网模式。\n';
  }
  await saveAddresses(base+(options.mode==='public'?'公网网址正在连接，请稍候。\n':''));
  if(options.open)openBrowser(localUrl);
  console.log('\n按回车或 Ctrl+C 停止本次运行；stop.bat 可停止本项目全部服务。\n请保持电脑和此窗口运行。');
  if(options.mode==='public'){
   try{
    const executable=await ensureCloudflared({runtimeRoot,signal:abort.signal});
    if(stopped)return;
    await mkdir(runtimeRoot,{recursive:true});await writeFile(join(runtimeRoot,'quick-tunnel.yml'),'{}\n','utf8');
    if(stopped)return;
    console.log('\n正在生成外网游玩网址（自动选择连接协议）…');
    tunnel=startQuickTunnel({executable,localUrl,runtimeRoot,sessionId,signal:abort.signal,onProgress:console.log,onExit:()=>{
     console.log('\n公网连接已断开。本机仍可游玩，请重启启动器获取新链接。');
     void updateOwnedStatus(base+'公网连接已断开，请重新运行 start.bat。\n');
    }});
    const publicUrl=await tunnel.ready;if(stopped)return;
    await saveAddresses(base+`发给朋友的网址：${publicUrl}\n这是临时链接，重新启动会变化。电脑和窗口需要保持运行。\n每个玩家拥有独立的游戏进度，不是多人联机。\n`);
    console.log(`\n发给朋友的网址：\n\n  ${publicUrl}\n\n已保存到：${addressFile}\n网址每次启动会变化；每个人独立游玩。\n`);
    if(!await canResolvePublicUrl(publicUrl)&&!stopped)console.log(`提示：公网隧道已连通，但这台电脑暂时无法解析新域名。\n本机请使用 ${localUrl} 游玩；若浏览器打不开公网链接，可检查 DNS 缓存或代理的 DNS 设置。\n`);
   }catch(error){
    if(stopped)return;
    console.error(`\n未能建立公网分享：${error.message}\n本机游戏仍可游玩；也可退出后选择局域网模式。`);
    await saveAddresses(base+'公网分享未建立，请检查网络后重新运行 start.bat。\n');
   }
  }else console.log(`地址已保存到：${addressFile}`);
  // HTTP server keeps this process alive until the user stops it.
 }catch(error){if(stopped)return;await stop();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('\n启动失败：'+error.message);process.exitCode=1;});
}
