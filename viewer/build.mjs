import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const htmlName='Varesa-World3D.html';

const result=await build({entryPoints:[join(root,'viewer','src','main.js')],bundle:true,format:'iife',target:'es2020',minify:true,write:false,legalComments:'inline',metafile:true});
if(Object.keys(result.metafile.inputs).some(path=>/assets[/\\]character|src[/\\]character|MMDLoader/i.test(path)))throw new Error('Release viewer unexpectedly depends on the licensed character model.');

const script=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const projectLicense=(await readFile(join(root,'LICENSE'),'utf8')).replaceAll('\r\n','\n');
const threeLicense=(await readFile(join(root,'node_modules','three','LICENSE'),'utf8')).replaceAll('\r\n','\n');
const licenseNotice=`<!--\nProject source — MIT License\n${projectLicense}\n\nThree.js — MIT License\n${threeLicense}\n-->`;
const html=`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101b2a"><title>雨宿り · 雨夜街角观赏版</title>${licenseNotice}<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101b2a}body{overscroll-behavior:none}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab}canvas:active{cursor:grabbing}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style></head><body><canvas id="scene" role="img" tabindex="0" aria-label="雨夜街角三维微缩观赏版。鼠标拖动旋转，滚轮缩放，右键拖动平移；触屏单指旋转，双指缩放或平移。双击恢复初始视角。方向键旋转，加减键缩放，Home 恢复。"></canvas><noscript>请启用 JavaScript 观看三维场景。</noscript><script>${script}</script></body></html>`;

await writeFile(join(root,htmlName),html);
console.log(`Built standalone viewer: ${join(root,htmlName)} (${Math.round(Buffer.byteLength(html)/1024)} KiB)`);
