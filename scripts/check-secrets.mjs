// Inspect the exact set of files Git would commit. Findings never print values.
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {extname} from 'node:path';

const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z']);
const files=[...new Set(names.toString('utf8').split('\0').filter(Boolean))];
const binary=new Set(['.bmp','.gif','.ico','.jpg','.jpeg','.png','.webp','.pmx','.zip','.gz','.woff','.woff2','.ttf','.exe','.p12','.pfx']);
const rules=[
 ['private key block',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
 ['GitHub token',/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b/g],
 ['OpenAI-style API key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
 ['AWS access key',/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
 ['Google API key',/\bAIza[0-9A-Za-z_-]{35}\b/g],
 ['Slack token',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
 ['credential in URL',/\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/g],
 ['quoted credential assignment',/\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*(['"`])[^'"`\r\n]{8,}\1/gi]
];
const findings=[];
for(const file of files){
 let stat;try{stat=statSync(file);}catch{continue;}
 if(!stat.isFile()||binary.has(extname(file).toLowerCase())||stat.size>2*1024*1024)continue;
 const source=readFileSync(file,'utf8');if(source.includes('\0'))continue;
 for(const [kind,regex] of rules){
  regex.lastIndex=0;
  for(const match of source.matchAll(regex)){
   if(kind==='credential in URL'&&/^https?:\/\/user:pass@/i.test(match[0]))continue;
   const line=source.slice(0,match.index).split('\n').length;
   findings.push({file,line,kind});
  }
 }
}
if(findings.length){for(const finding of findings)console.error(`${finding.file}:${finding.line}: ${finding.kind}`);console.error(`${findings.length} potential credential(s) require review. Values were not printed.`);process.exitCode=1;}
else console.log(`Checked ${files.length} Git candidate files; no credential patterns found.`);
