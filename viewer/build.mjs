import {build} from 'esbuild';
import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const release=join(root,'release');
const htmlName='Varesa-World3D-rainy-corner-viewer-v1.0.0.html';
const zipName='Varesa-World3D-rainy-corner-viewer-v1.0.0.zip';

const result=await build({entryPoints:[join(root,'viewer','src','main.js')],bundle:true,format:'iife',target:'es2020',minify:true,write:false,legalComments:'inline',metafile:true});
if(Object.keys(result.metafile.inputs).some(path=>/assets[/\\]character|src[/\\]character|MMDLoader/i.test(path)))throw new Error('Release viewer unexpectedly depends on the licensed character model.');

const script=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const html=`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101b2a"><title>雨宿り · 雨夜街角观赏版</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101b2a}body{overscroll-behavior:none}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab}canvas:active{cursor:grabbing}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style></head><body><canvas id="scene" role="img" tabindex="0" aria-label="雨夜街角三维微缩观赏版。鼠标拖动旋转，滚轮缩放，右键拖动平移；触屏单指旋转，双指缩放或平移。双击恢复初始视角。方向键旋转，加减键缩放，Home 恢复。"></canvas><noscript>请启用 JavaScript 观看三维场景。</noscript><script>${script}</script></body></html>`;

await mkdir(release,{recursive:true});
await writeFile(join(release,htmlName),html);
await copyFile(join(root,'node_modules','three','LICENSE'),join(release,'THREE-LICENSE.txt'));
await writeFile(join(release,'README-观赏版.txt'),`Varesa World 3D · 雨夜街角观赏版\n\n双击 ${htmlName} 即可离线观赏便利店街角。\n\n鼠标左键拖动旋转，滚轮缩放，右键拖动平移；触屏单指旋转、双指缩放或平移。双击或按 Home 复位。\n\n此观赏版不含瓦雷莎人物、背包与购物玩法，也不包含角色模型或贴图。完整互动版的源码与本地构建方法见：https://github.com/w2902171175/Varesa-World3D\n\n本包包含项目 MIT License 与 Three.js 原始许可证文件。\n`);
await writeFile(join(release,'UPLOAD-INSTRUCTIONS.txt'),`GitHub Release 上传清单\n\n建议上传：${zipName}\n可选单文件：${htmlName}\n\n本次公开交付是没有人物和购物玩法的雨夜街角观赏版。ZIP 内有观赏版 HTML、使用说明、项目 MIT License 和 Three.js 许可证。\n\n不要上传本地 Output/ 的主游戏 HTML 或本地游玩包：它们内嵌了原模型说明禁止二次配布的瓦雷莎模型与贴图。完整互动版请让使用者从官方原始发布页自行取得模型并按仓库 README 在本地构建。\n`);
console.log(`Built public viewer: ${join(release,htmlName)} (${Math.round(Buffer.byteLength(html)/1024)} KiB)`);
