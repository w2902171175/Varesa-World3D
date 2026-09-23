import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerSession, requestSessionStop } from '../scripts/runtime-session.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = join(projectRoot, 'qa');
const prefix = 'runtime-session-test-';

async function workspace(t) {
  await mkdir(qaRoot, { recursive: true });
  const directory = await mkdtemp(join(qaRoot, prefix));
  const cleanups = [];
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    // Only a verified, task-created qa child may be deleted recursively.
    const actualQA = await realpath(qaRoot), target = await realpath(directory);
    const withinQA = relative(actualQA, target);
    assert.ok(withinQA && !isAbsolute(withinQA) && withinQA !== '..' && !withinQA.startsWith('..\\') && !withinQA.startsWith('../'));
    assert.ok(basename(target).startsWith(prefix), 'Cleanup target must be this test workspace');
    await rm(target, { recursive: true, force: true });
  });
  async function register(name, kind, onStop) {
    const root = join(directory, name); await mkdir(root, { recursive: true });
    const session = await registerSession({ root, kind, onStop });
    cleanups.push(() => session.dispose()); return session;
  }
  return { directory, register, cleanups };
}
async function waitUntil(predicate) {
  const deadline = Date.now() + 500;
  while (!predicate() && Date.now() < deadline) await new Promise(resolveNext => setTimeout(resolveNext, 5));
  assert.ok(predicate(), 'Expected local callback did not run');
}
function rawRequest(pipeName, text, { trickle = false } = {}) {
  return new Promise((resolveResult, reject) => {
    const socket = createConnection({ path: pipeName });
    let response = '', done = false, interval = null;
    const timeout = setTimeout(() => finish(new Error('Test pipe did not answer within its bounded read window')), 2500);
    function finish(error, result) {
      if (done) return; done = true;
      clearTimeout(timeout); clearInterval(interval); socket.destroy();
      if (error) reject(error); else resolveResult(result);
    }
    socket.on('connect', () => {
      socket.write(text);
      if (trickle) interval = setInterval(() => { if (!socket.destroyed) socket.write(' '); }, 200);
    });
    socket.on('data', chunk => {
      response += chunk.toString(); const newline = response.indexOf('\n');
      if (newline >= 0) { try { finish(null, JSON.parse(response.slice(0, newline))); } catch (error) { finish(error); } }
    });
    socket.on('error', error => finish(error));
    socket.on('end', () => { if (!done) finish(new Error('Pipe closed before its response')); });
  });
}

describe('Project-local Windows session control', { skip: process.platform !== 'win32' }, () => {
  test('registration persists its own record and repeated authenticated stops call onStop once', async t => {
    const ws = await workspace(t); let calls = 0;
    const session = await ws.register('project', 'launcher', () => { calls++; });
    const diskRecord = JSON.parse(await readFile(session.recordPath, 'utf8'));
    assert.deepEqual(diskRecord, session.record);
    assert.equal(diskRecord.app, 'ame-machi-miniature'); assert.equal(diskRecord.version, 1);
    assert.equal(diskRecord.root, join(ws.directory, 'project')); assert.equal(diskRecord.pid, process.pid);
    assert.equal(diskRecord.kind, 'launcher'); assert.match(diskRecord.token, /^[0-9a-f]{64}$/);
    assert.ok(diskRecord.pipeName.startsWith('\\\\.\\pipe\\ame-machi-miniature-'));
    assert.equal(dirname(session.recordPath), join(diskRecord.root, '.runtime', 'sessions'));
    const responses = await Promise.all([requestSessionStop(diskRecord), requestSessionStop(diskRecord), requestSessionStop(diskRecord)]);
    assert.deepEqual(responses, [true, true, true]);
    await waitUntil(() => calls === 1);
  });

  test('a wrong secret is refused without affecting the live session', async t => {
    const ws = await workspace(t); let calls = 0;
    const session = await ws.register('project', 'server', () => { calls++; });
    const token = (session.record.token[0] === '0' ? '1' : '0') + session.record.token.slice(1);
    assert.equal(await requestSessionStop({ ...session.record, token }), false);
    assert.equal(calls, 0);
    assert.equal(await requestSessionStop(session.record), true);
    await waitUntil(() => calls === 1);
  });

  test('the acknowledgement arrives even when onStop immediately disposes its session', async t => {
    const ws = await workspace(t); let calls = 0, session;
    session = await ws.register('project', 'server', async () => { calls++; await session.dispose(); });
    assert.equal(await requestSessionStop(session.record), true);
    await waitUntil(() => calls === 1); await session.dispose();
    await assert.rejects(access(session.recordPath), { code: 'ENOENT' });
    assert.equal(await requestSessionStop(session.record, { timeoutMs: 150 }), false);
  });

  test('dispose closes idle clients and removes only its record, preserving a sibling session and file', async t => {
    const ws = await workspace(t); let siblingCalls = 0;
    const first = await ws.register('project', 'launcher', () => {});
    const sibling = await ws.register('project', 'server', () => { siblingCalls++; });
    const sentinel = join(dirname(first.recordPath), 'unrelated-record.json');
    await writeFile(sentinel, '{"preserve":true}\n');
    const client = createConnection({ path: first.record.pipeName }); await once(client, 'connect');
    const closed = once(client, 'close');
    await first.dispose(); await first.dispose(); await closed;
    assert.equal(client.destroyed, true);
    await assert.rejects(access(first.recordPath), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(sentinel, 'utf8')), { preserve: true });
    assert.equal(JSON.parse(await readFile(sibling.recordPath, 'utf8')).token, sibling.record.token);
    assert.equal(await requestSessionStop(sibling.record), true); await waitUntil(() => siblingCalls === 1);
  });

  test('two roots have distinct endpoints and callbacks cannot cross project boundaries', async t => {
    const ws = await workspace(t); let aCalls = 0, bCalls = 0;
    const a = await ws.register('project-a', 'launcher', () => { aCalls++; });
    const b = await ws.register('project-b', 'launcher', () => { bCalls++; });
    assert.notEqual(a.record.pipeName, b.record.pipeName); assert.notEqual(a.record.token, b.record.token);
    assert.equal(await requestSessionStop({ ...b.record, root: a.record.root }), false);
    assert.equal(await requestSessionStop(a.record), true); await waitUntil(() => aCalls === 1);
    assert.equal(bCalls, 0);
    assert.equal(await requestSessionStop(b.record), true); await waitUntil(() => bCalls === 1);
  });

  test('invalid records and remote/TCP endpoints are rejected without calling onStop', async t => {
    const ws = await workspace(t); let calls = 0;
    const session = await ws.register('project', 'launcher', () => { calls++; });
    const invalid = [null, { ...session.record, app: 'different-app' }, { ...session.record, version: 2 },
      { ...session.record, root: '.' }, { ...session.record, pid: -1 }, { ...session.record, kind: 'other' },
      { ...session.record, token: 'not-a-secret' }, { ...session.record, pipeName: 'http://127.0.0.1:4180/stop' },
      { ...session.record, pipeName: '\\\\remote-host\\pipe\\not-local' }, { ...session.record, pipeName: '\\\\.\\pipe\\different-app' }];
    for (const record of invalid) assert.equal(await requestSessionStop(record), false);
    assert.equal(await requestSessionStop(session.record, { timeoutMs: NaN }), false);
    assert.equal(calls, 0);
  });

  test('malformed, oversized and slowly streamed incomplete requests are bounded and never stop the session', async t => {
    const ws = await workspace(t); let calls = 0;
    const session = await ws.register('project', 'server', () => { calls++; });
    assert.deepEqual(await rawRequest(session.record.pipeName, 'not-json\n'), { ok: false });
    assert.deepEqual(await rawRequest(session.record.pipeName, JSON.stringify({ command: 'other', token: session.record.token }) + '\n'), { ok: false });
    assert.deepEqual(await rawRequest(session.record.pipeName, 'x'.repeat(10000)), { ok: false });
    assert.deepEqual(await rawRequest(session.record.pipeName, '{"command":', { trickle: true }), { ok: false });
    assert.equal(calls, 0);
    assert.equal(await requestSessionStop(session.record), true); await waitUntil(() => calls === 1);
  });

  test('an unresponsive local pipe returns false within the requested client timeout', async t => {
    const ws = await workspace(t);
    const session = await ws.register('project', 'server', () => {}); await session.dispose();
    // Reuse only this test's released, uniquely named endpoint as a silent peer.
    const sockets = new Set();
    const silent = createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
    ws.cleanups.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolveClose => silent.close(resolveClose)); });
    silent.listen(session.record.pipeName); await once(silent, 'listening');
    const start = Date.now();
    assert.equal(await requestSessionStop(session.record, { timeoutMs: 100 }), false);
    assert.ok(Date.now() - start < 1000, 'The client must not wait indefinitely for a silent local peer');
  });
});
