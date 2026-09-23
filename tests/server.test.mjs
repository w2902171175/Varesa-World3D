import assert from 'node:assert/strict';
import {test} from 'node:test';
import {request} from 'node:http';
import {execFile} from 'node:child_process';
import {access, mkdtemp, mkdir, readFile, rename, rm, symlink, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {promisify} from 'node:util';
import {brotliDecompressSync, gunzipSync} from 'node:zlib';
import {createGameServer} from '../serve.mjs';

const gameName = '瓦雷莎·雨夜便利店.html';
const fixtureBody = Buffer.from('<!doctype html><title>雨宿り</title>' + '雨夜 · convenience store\n'.repeat(1400));
const close = server => new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));

async function temporaryFiles(t) {
  const parent = resolve(await mkdtemp(join(tmpdir(), 'ame-server-test-')));
  t.after(async () => {
    // Only remove the fresh, task-owned temporary directory; never follow a
    // computed cleanup path outside the system temp directory.
    const part = relative(resolve(tmpdir()), parent);
    assert.ok(!isAbsolute(part) && !part.startsWith('..') && !part.includes(sep) && basename(parent).startsWith('ame-server-test-'));
    await rm(parent, {recursive: true, force: true});
  });
  const root = join(parent, 'Output'); await mkdir(root);
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Game index</title>');
  await writeFile(join(root, gameName), fixtureBody);
  return {parent, root};
}

async function start(t, options = {}) {
  const files = await temporaryFiles(t), server = await createGameServer({root: files.root, host: '127.0.0.1', port: 0, instanceId: 'test-instance', ...options});
  t.after(() => close(server));
  return {...files, server, port: server.address().port};
}

function get(port, path = '/', {method = 'GET', headers = {}} = {}) {
  return new Promise((resolveResponse, reject) => {
    const req = request({hostname: '127.0.0.1', port, path, method, headers, agent: false}, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolveResponse({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
    });
    req.on('error', reject); req.end();
  });
}

test('GET and HEAD serve only the fixed public game entry points', async t => {
  const {port, root} = await start(t);
  const index = await get(port); assert.equal(index.status, 200); assert.match(index.body.toString(), /Game index/);
  const game = await get(port, encodeURI('/' + gameName)); assert.equal(game.status, 200); assert.deepEqual(game.body, fixtureBody);
  assert.equal(game.headers['content-type'], 'text/html; charset=utf-8'); assert.equal(game.headers['x-content-type-options'], 'nosniff');
  const head = await get(port, encodeURI('/' + gameName), {method: 'HEAD'});
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), fixtureBody.length);
  for (const name of ['使用说明.txt', '角色来源.md', '动作来源.md', '模型原始使用说明.txt', 'THREE-LICENSE.txt']) {
    await writeFile(join(root, name), name); const reply = await get(port, encodeURI('/' + name));
    assert.equal(reply.status, 200); assert.equal(reply.body.toString(), name);
  }
});

test('health identifies this instance without paths, and unsupported methods receive 405', async t => {
  const {port} = await start(t);
  const health = await get(port, '/__game_health?launcher=1');
  assert.equal(health.status, 200); assert.deepEqual(JSON.parse(health.body), {app: 'ame-machi-miniature', instanceId: 'test-instance'});
  assert.equal(health.headers['cache-control'], 'no-store');
  const head = await get(port, '/__game_health', {method: 'HEAD'}); assert.equal(head.status, 200); assert.equal(head.body.length, 0);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await get(port, '/__game_health', {method});
    assert.equal(response.status, 405); assert.equal(response.headers.allow, 'GET, HEAD');
  }
});

test('encoded traversal, hidden files, source, archives and directories cannot be served', async t => {
  const {port, root, parent} = await start(t);
  await writeFile(join(parent, 'secret.txt'), 'outside secret');
  for (const name of ['download.zip', '.env', 'source.js', 'preview.html', 'photo.png']) await writeFile(join(root, name), 'not a public entry');
  await mkdir(join(root, 'directory'));
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%2e%2e%5csecret.txt', '/%252e%252e%252fsecret.txt', '/.env', '/%2eenv', '/download.zip', '/source.js', '/preview.html', '/photo.png', '/directory/', '/index.html%00', '//attacker.invalid/index.html']) {
    const response = await get(port, path); assert.ok([400, 403, 404].includes(response.status), `${path} unexpectedly returned ${response.status}`);
    assert.ok(!response.body.toString().includes('outside secret'));
  }
  assert.equal((await get(port, '/bad%ZZ')).status, 400);
  assert.equal((await get(port, '/missing.txt')).status, 404);
});

test('Host headers cannot alter routing or health, and absolute-form targets are refused', async t => {
  const {port} = await start(t);
  for (const host of ['attacker.invalid:8888', 'attacker.invalid/../../secret.txt', 'localhost@attacker.invalid']) {
    const response = await get(port, '/index.html?x=1', {headers: {Host: host}});
    assert.equal(response.status, 200); assert.match(response.body.toString(), /Game index/);
    const health = await get(port, '/__game_health', {headers: {Host: host}}); assert.equal(JSON.parse(health.body).instanceId, 'test-instance');
  }
  assert.equal((await get(port, 'http://attacker.invalid/index.html')).status, 400);
});

test('gzip and Brotli are negotiated, reusable, and decode to the exact original bytes', async t => {
  const {port} = await start(t), path = encodeURI('/' + gameName);
  const [gz, br, concurrent] = await Promise.all([
    get(port, path, {headers: {'Accept-Encoding': 'gzip'}}),
    get(port, path, {headers: {'Accept-Encoding': 'gzip, br'}}),
    get(port, path, {headers: {'Accept-Encoding': 'br'}}),
  ]);
  assert.equal(gz.headers['content-encoding'], 'gzip'); assert.deepEqual(gunzipSync(gz.body), fixtureBody);
  assert.equal(br.headers['content-encoding'], 'br'); assert.deepEqual(brotliDecompressSync(br.body), fixtureBody);
  assert.deepEqual(concurrent.body, br.body); assert.equal(br.headers.vary, 'Accept-Encoding');
  assert.ok(gz.body.length < fixtureBody.length); assert.ok(br.body.length < fixtureBody.length);
  const head = await get(port, path, {method: 'HEAD', headers: {'Accept-Encoding': 'br'}});
  assert.equal(head.body.length, 0); assert.equal(Number(head.headers['content-length']), br.body.length); assert.equal(head.headers.etag, br.headers.etag);
  const noBr = await get(port, path, {headers: {'Accept-Encoding': 'br;q=0,gzip;q=0.8'}}); assert.equal(noBr.headers['content-encoding'], 'gzip');
  const identity = await get(port, path, {headers: {'Accept-Encoding': 'gzip;q=0.5,identity;q=1'}}); assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal((await get(port, path, {headers: {'Accept-Encoding': 'br;q=0,gzip;q=0,identity;q=0,*;q=0'}})).status, 406);
});

test('ETags revalidate cached representations and content changes invalidate them', async t => {
  const {port, root} = await start(t);
  const first = await get(port, '/index.html');
  const unchanged = await get(port, '/index.html', {headers: {'If-None-Match': first.headers.etag}});
  assert.equal(unchanged.status, 304); assert.equal(unchanged.body.length, 0);
  const updated = Buffer.from('<!doctype html><title>Updated entry and new bytes</title>');
  await writeFile(join(root, 'index.html'), updated);
  await utimes(join(root, 'index.html'), new Date(), new Date(Date.now() + 2000));
  const fresh = await get(port, '/index.html', {headers: {'If-None-Match': first.headers.etag}});
  assert.equal(fresh.status, 200); assert.deepEqual(fresh.body, updated); assert.notEqual(fresh.headers.etag, first.headers.etag);
});

test('symlink files and replacement-root junctions cannot escape the canonical root', async t => {
  const {port, root, parent} = await start(t), outside = join(parent, 'outside');
  await mkdir(outside); await writeFile(join(outside, 'index.html'), 'outside secret');
  const link = join(root, '角色来源.md');
  try { await symlink(join(outside, 'index.html'), link, 'file'); }
  catch (failure) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(failure.code)) throw failure;
    // Windows permits a junction without developer-mode symlink privileges.
    await symlink(outside, link, 'junction');
  }
  assert.equal((await get(port, encodeURI('/角色来源.md'))).status, 403);
  await get(port, '/index.html'); // Warm the cache before changing the root path.
  const moved = join(parent, 'original-output');
  for (const target of [root, moved, outside]) {
    const part = relative(parent, resolve(target)); assert.ok(part && !isAbsolute(part) && !part.startsWith('..'));
  }
  await rename(root, moved); await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir');
  const response = await get(port, '/index.html');
  assert.equal(response.status, 403); assert.ok(!response.body.toString().includes('outside secret'));
});

test('an occupied port rejects with EADDRINUSE and leaves the original service alone', async t => {
  const {port, root} = await start(t);
  await assert.rejects(createGameServer({root, host: '127.0.0.1', port}), {code: 'EADDRINUSE'});
  assert.equal(JSON.parse((await get(port, '/__game_health')).body).instanceId, 'test-instance');
});

test('import is passive and the default Output root does not depend on cwd', async t => {
  try { await access(new URL('../Output/index.html', import.meta.url)); }
  catch { t.skip('离线页面尚未构建；安装本地角色素材并运行 npm run build 后可执行此项检查。'); return; }
  const {parent} = await temporaryFiles(t);
  const sourceURL = new URL('../serve.mjs', import.meta.url).href;
  const expected = await readFile(new URL('../Output/index.html', import.meta.url));
  const script = `
    import {get} from 'node:http';
    const {createGameServer}=await import(${JSON.stringify(sourceURL)});
    const server=await createGameServer({port:0});
    const result=await new Promise((resolve,reject)=>get({hostname:'127.0.0.1',port:server.address().port,path:'/',agent:false},r=>{const a=[];r.on('data',b=>a.push(b));r.on('end',()=>resolve({status:r.statusCode,body:Buffer.concat(a).toString('base64')}));}).on('error',reject));
    await new Promise(resolve=>server.close(resolve));
    console.log(JSON.stringify(result));
  `;
  const {stdout} = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {cwd: parent, windowsHide: true, timeout: 10000});
  const result = JSON.parse(stdout); assert.equal(result.status, 200); assert.deepEqual(Buffer.from(result.body, 'base64'), expected);
});
