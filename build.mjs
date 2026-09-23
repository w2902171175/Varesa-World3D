import {build} from 'esbuild';
import {readFile,writeFile,copyFile,access,mkdir} from 'node:fs/promises';
try{await access('assets/character/embedded.js');}
catch{throw new Error('缺少本地角色资源。请运行 npm run build（会先从原始发布地址准备模型），或单独运行 npm run prepare:character；详情见 README.md。');}
await mkdir('Output',{recursive:true});
const result=await build({entryPoints:['src/main.js'],bundle:true,format:'iife',target:'es2020',minify:true,write:false,legalComments:'inline'});
const script=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const gameCss=(await Promise.all(['src/game.css','src/inventory.css'].map(path=>readFile(path,'utf8')))).join('\n');
const html=`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101b2a"><title>瓦雷莎 · 雨夜便利店</title><!-- Character model: miHoYo / 观海. Locomotion data obtained from mocap.cs.cmu.edu; database funded by NSF EIA-0196217. Retargeted CMU 35_01 and 35_17, not extracted Genshin game animations. --><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101b2a}body{overscroll-behavior:none}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab}canvas:active{cursor:grabbing}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
${gameCss}</style></head><body><canvas id="scene" role="application" tabindex="0" aria-label="瓦雷莎雨夜便利店游戏。按住 WASD 移动，Shift 按一次切换奔跑或行走，松开 Shift 不取消，空格跳跃，普通移动鼠标即可转向，无需按住按钮，按住 Alt 显示光标点击界面并暂停转向，松开恢复，背包或读物打开及 Esc 暂停时仍保持自由光标，Esc 暂停转向并释放鼠标，点击场景恢复，滚轮缩放，F 交互，R 使用，B 背包，U 雨伞，Tab 切换观赏。"></canvas><noscript>请启用 JavaScript 观看三维场景。</noscript><script>${script}</script></body></html>`;
await writeFile('Output/瓦雷莎·雨夜便利店.html',html);
const gameEntry='./'+encodeURIComponent('瓦雷莎·雨夜便利店.html');
await writeFile('Output/index.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>瓦雷莎 · 雨夜便利店</title><script>location.replace(${JSON.stringify(gameEntry)}+location.search+location.hash)</script><a href="${gameEntry}">打开瓦雷莎 · 雨夜便利店</a></html>`);
await copyFile('node_modules/three/LICENSE','Output/THREE-LICENSE.txt');
await copyFile('assets/motion/SOURCE.md','Output/动作来源.md');
await writeFile('Output/角色来源.md',(await readFile('assets/character/SOURCE.md','utf8')).replaceAll('../motion/SOURCE.md','动作来源.md'));
console.log('Built offline interactive scene: '+Math.round(Buffer.byteLength(html)/1024)+' KiB');
