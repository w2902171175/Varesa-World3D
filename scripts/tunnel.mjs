import {createHash,randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';

// Official release metadata checked on 2026-09-12. Downloads are versioned and
// verified against the release digest before any executable is launched.
const VERSION='2026.9.1';
const DIGESTS={
 amd64:'2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712',
 '386':'11b6e4b2d306950bd87e7caa4deee8e80a32d71ffee555a96237a76651eeae4c'
};
export function cloudflaredArgs({localUrl,configPath}){
 return ['tunnel','--config',configPath,'--no-autoupdate','--protocol','auto','--url',localUrl];
}
export function describeTunnelFailure(log){
 const text=String(log);
 if(/no such host|server misbehaving|DNS Resolution[^\r\n]*(?:FAIL|status=fail)|lookup[^\r\n]*(?:timeout|failed)/i.test(text))return 'DNS 解析失败，未能找到 Cloudflare 服务器；请检查当前网络的 DNS。';
 const tcpBlocked=/HTTP\/2 connection is blocked|TCP Connectivity[^\r\n]*(?:FAIL|status=fail)/i.test(text);
 const quicAvailable=/QUIC connection successful|UDP Connectivity[^\r\n]*(?:PASS|status=pass)/i.test(text);
 if(tcpBlocked&&quicAvailable)return '网络检测显示 TCP / HTTP2 连接失败，但 QUIC 可用。请使用自动协议或 QUIC 连接。';
 if(/TLS handshake with edge error/i.test(text))return '与 Cloudflare 的 TLS 握手失败，连接在建立时被中断；请检查当前网络或代理的连接情况。';
 if(/failed to dial to edge with quic|QUIC[^\r\n]*timeout|UDP Connectivity[^\r\n]*(?:FAIL|status=fail)/i.test(text))return 'QUIC / UDP 连接超时或不可达，自动协议也未能建立连接；请检查网络是否允许连接 Cloudflare 的 7844 端口。';
 if(tcpBlocked)return 'TCP / HTTP2 无法连接 Cloudflare 的 7844 端口，尚未找到可用的隧道连接。';
 return '没有收到 Cloudflare 的连接成功确认。请检查网络连接，具体原因见连接日志。';
}
export function extractTunnelUrl(text){
 for(const token of String(text).match(/https:\/\/[^\s<>"'`|]+/g)||[]){
  if(/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com\/?$/i.test(token))return new URL(token).origin;
 }
 return null;
}
export function createTunnelObserver(onReady){
 let buffer='',url=null,connected=false,announced=false;
 return {
  get url(){return url;},get connected(){return connected;},
  push(chunk){
   buffer+=String(chunk);let end;
   while((end=buffer.indexOf('\n'))!==-1){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    url ||= extractTunnelUrl(line);
    if(line.includes('Registered tunnel connection'))connected=true;
    if(url&&connected&&!announced){announced=true;onReady(url);}
   }
   if(buffer.length>32768)buffer=buffer.slice(-32768);
  }
 };
}
export async function ensureCloudflared({runtimeRoot,signal,log=console.log}){
 signal?.throwIfAborted();
 if(process.platform!=='win32')throw new Error('此启动器的公网工具为 Windows 版本。');
 const arch=process.arch==='ia32'?'386':'amd64';
 const filename=`cloudflared-${VERSION}-${arch}.exe`,destination=join(runtimeRoot,filename);
 const expected=DIGESTS[arch],url=`https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-windows-${arch}.exe`;
 await mkdir(runtimeRoot,{recursive:true});
 const hash=data=>createHash('sha256').update(data).digest('hex');
 try{if(hash(await readFile(destination))===expected)return destination;}catch(error){if(error.code!=='ENOENT')throw error;}
 log('首次公网分享：正在从 Cloudflare 官方下载连接工具（约 55 MB）…');
 const partial=destination+'.'+randomUUID()+'.part';
 const downloadAbort=new AbortController();
 const cancelDownload=()=>downloadAbort.abort(signal?.reason);
 signal?.addEventListener('abort',cancelDownload,{once:true});
 if(signal?.aborted)cancelDownload();
 const downloadTimeout=setTimeout(()=>downloadAbort.abort(new Error('下载超时')),180000);
 try{
  const response=await fetch(url,{signal:downloadAbort.signal});
  if(!response.ok||!response.body)throw new Error(`HTTP ${response.status}`);
  let received=0,lastReport=0;const digest=createHash('sha256');
  const progress=new Transform({transform(chunk,encoding,done){received+=chunk.length;digest.update(chunk);if(received-lastReport>10*1024*1024){lastReport=received;log(`已下载 ${Math.round(received/1024/1024)} MB…`);}done(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),progress,createWriteStream(partial,{flags:'wx'}),{signal:downloadAbort.signal});
  if(digest.digest('hex')!==expected)throw new Error('下载校验不一致，请重试');
  try{await rename(partial,destination);}
  catch(error){
   // Another launcher may have finished the same download and begun using it.
   let existingValid=false;try{existingValid=hash(await readFile(destination))===expected;}catch{}
   if(!existingValid)throw error;
  }
  await writeFile(join(runtimeRoot,'cloudflared-source.txt'),`Cloudflare cloudflared ${VERSION}\n${url}\nSHA256 ${expected}\nhttps://developers.cloudflare.com/tunnel/setup/\n`);
  return destination;
 }catch(error){throw new Error(`公网工具下载失败：${error.message}\n可从 ${url} 下载，保存为 ${destination}`);}
 finally{clearTimeout(downloadTimeout);signal?.removeEventListener('abort',cancelDownload);await rm(partial,{force:true});}
}
export function startQuickTunnel({executable,localUrl,runtimeRoot,sessionId,signal,onExit=()=>{},onProgress=()=>{}}){
 signal?.throwIfAborted();
 const logPath=join(runtimeRoot,`tunnel-${sessionId}.log`);
 const logFile=createWriteStream(logPath,{flags:'a'});
 // Auto starts with QUIC and permits cloudflared's own transport fallback.
 // Forcing HTTP/2 prevented startup on networks where only QUIC was reachable.
 const child=spawn(executable,cloudflaredArgs({localUrl,configPath:join(runtimeRoot,'quick-tunnel.yml')}),{cwd:runtimeRoot,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let settled=false,stopped=false,didConnect=false,timer;
 let logTail='',lastProtocol='',addressAssigned=false;
 const stop=()=>{stopped=true;if(child.exitCode===null)child.kill();};
 const ready=new Promise((resolve,reject)=>{
  const fail=message=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`${message}\n连接日志：${logPath}`));}};
  const observer=createTunnelObserver(url=>{if(!settled){settled=true;didConnect=true;clearTimeout(timer);resolve(url);}});
  logFile.once('error',error=>{fail(`无法写入连接日志：${error.message}`);if(didConnect&&!stopped)onExit();stop();});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
   logFile.write(chunk);logTail=(logTail+chunk.toString()).slice(-65536);observer.push(chunk);
   const protocols=[...logTail.matchAll(/(?:Initial protocol|Switching to)[ :=]+(quic|http2)/gi)];
   const protocol=protocols.at(-1)?.[1]?.toLowerCase();
   if(protocol&&protocol!==lastProtocol){lastProtocol=protocol;onProgress(`正在通过 ${protocol.toUpperCase()} 建立公网连接…`);}
   if(observer.url&&!addressAssigned){addressAssigned=true;onProgress('临时域名已分配，正在等待连接成功确认…');}
  });
  child.once('error',error=>fail(`公网连接无法启动：${error.message}`));
  child.once('close',code=>{logFile.end();if(!settled)fail(`公网连接已退出（${code}）：${describeTunnelFailure(logTail)}`);else if(didConnect&&!stopped)onExit();});
  timer=setTimeout(()=>{fail(`公网连接超时：${describeTunnelFailure(logTail)}`);stop();},120000);
  signal?.addEventListener('abort',()=>{fail('启动已取消');stop();},{once:true});
 });
 return {ready,stop,child,logPath};
}
