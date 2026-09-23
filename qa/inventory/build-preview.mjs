import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const {outputFiles}=await build({entryPoints:['qa/inventory/preview.js'],bundle:true,minify:true,write:false,format:'iife',target:'es2020'});
const css=(await Promise.all(['src/game.css','src/inventory.css'].map(path=>readFile(path,'utf8')))).join('\n');
await writeFile('qa/inventory/背包界面检查.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>背包界面检查</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;overflow:hidden;background:#183039 url('../game/游玩预览.png') center/cover;height:100vh}.fixture-status{position:fixed;bottom:2px;left:40%;z-index:100;color:#eedbbc;font:11px sans-serif;pointer-events:none}#reopen{position:absolute;top:45%;left:43%;padding:15px}${css}</style><body><script>${outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`);
