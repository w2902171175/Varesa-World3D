// Explicit manual check: temporarily publishes the game, verifies the public
// origin, then stops both the test tunnel and its dedicated local server.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createGameServer} from '../serve.mjs';
import {ensureCloudflared,startQuickTunnel} from '../scripts/tunnel.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtimeRoot=join(root,'.runtime');
const instanceId='public-smoke-'+randomUUID(),abort=new AbortController();
let server,tunnel;
let verificationAddresses=null,dnsMode='system';
const runFile=promisify(execFile);
async function publicFetch(url,options={}){
 if(!verificationAddresses){
   const dnsUrl=new URL('https://cloudflare-dns.com/dns-query');dnsUrl.searchParams.set('name',new URL(url).hostname);dnsUrl.searchParams.set('type','A');
   const dns=await fetch(dnsUrl,{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(10000)}).then(r=>r.json());
   verificationAddresses=dns.Answer?.filter(answer=>answer.type===1).map(answer=>answer.data);
   if(!verificationAddresses?.length)throw new Error('Public DNS has not resolved the new domain yet');
   dnsMode='public DNS; system resolver failures were separately confirmed';
   console.log('使用公共 DNS 独立验证公网连接（不更改系统设置，保留 TLS 证书校验）。');
 }
 const hostname=new URL(url).hostname;
 const {stdout}=await runFile('curl.exe',['--silent','--show-error','--fail','--compressed','--include','--connect-timeout','10','--max-time','90','--resolve',`${hostname}:443:${verificationAddresses[0]}`,url],{encoding:'buffer',maxBuffer:20*1024*1024,windowsHide:true});
 let remaining=stdout,headers,status;
 do{
  const end=remaining.indexOf('\r\n\r\n');if(end<0)throw new Error('Missing HTTPS response headers');
  const lines=remaining.subarray(0,end).toString().split('\r\n');status=Number(lines.shift().split(' ')[1]);headers={};
  for(const line of lines){const colon=line.indexOf(':');if(colon>0)headers[line.slice(0,colon).toLowerCase()]=line.slice(colon+1).trim();}
  remaining=remaining.subarray(end+4);
 }while(remaining.subarray(0,5).toString()==='HTTP/');
 return new Response(remaining,{status,headers});
}
try{
 server=await createGameServer({host:'127.0.0.1',port:0,instanceId});
 const localUrl=`http://127.0.0.1:${server.address().port}`;
 const executable=await ensureCloudflared({runtimeRoot,signal:abort.signal});
 await mkdir(runtimeRoot,{recursive:true});await writeFile(join(runtimeRoot,'quick-tunnel.yml'),'{}\n');
 tunnel=startQuickTunnel({executable,localUrl,runtimeRoot,sessionId:instanceId,signal:abort.signal,onProgress:console.log});
 const publicUrl=await tunnel.ready;
 console.log('公网隧道已连接，开始验证公网 HTTP 请求：'+publicUrl);
 let publicResponse,body,lastError;
 const dnsDeadline=Date.now()+90000;
 for(let attempt=0;;attempt++){
  try{
   publicResponse=await publicFetch(publicUrl+'/__game_health',{signal:AbortSignal.timeout(10000)});
   assert.equal(publicResponse.status,200);body=await publicResponse.json();assert.equal(body.instanceId,instanceId);break;
  }catch(error){lastError=error;if(Date.now()>=dnsDeadline)throw error;if(attempt===1)console.log('公网检查正在等待域名可解析…');await delay(1500);}
 }
 assert.equal(body?.app,'ame-machi-miniature',lastError?.message);
 const entry=await publicFetch(publicUrl+'/',{signal:AbortSignal.timeout(15000)});
 assert.equal(entry.status,200);assert.match(await entry.text(),/location\.replace/);
 const game=await publicFetch(publicUrl+'/'+encodeURIComponent('瓦雷莎·雨夜便利店.html'),{signal:AbortSignal.timeout(30000)});
 assert.equal(game.status,200);assert.match(game.headers.get('content-type'),/text\/html/);
 const html=await game.text();assert.match(html,/瓦雷莎/);assert.match(html,/按住 Alt/);
 const sha=data=>createHash('sha256').update(data).digest('hex');
 assert.equal(sha(html),sha(await readFile(join(root,'Output','瓦雷莎·雨夜便利店.html'))),'Public game must be transferred in full');
 const result={testedAt:new Date().toISOString(),publicUrl,health:'passed',entry:'passed',game:'passed',sha256:sha(html),dnsMode,gameCharacters:html.length,cloudflareRay:publicResponse.headers.get('cf-ray'),logPath:tunnel.logPath,stoppedAfterTest:true};
 await writeFile(join(root,'qa','public-tunnel-result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{
 const tunnelClosed=tunnel&&tunnel.child.exitCode===null?once(tunnel.child,'close').catch(()=>{}):Promise.resolve();
 abort.abort();tunnel?.stop();
 if(server){server.close();server.closeAllConnections();}
 await tunnelClosed;
 console.log('公网测试结束，测试隧道和临时服务器已停止。');
}
