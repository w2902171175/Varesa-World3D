import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const APP = 'ame-machi-miniature';
const VERSION = 1;
const MAX_MESSAGE_BYTES = 4096;
const READ_TIMEOUT_MS = 1500;
const PIPE_PREFIX = '\\\\.\\pipe\\ame-machi-miniature-';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PIPE_PATTERN = new RegExp('^' + PIPE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([0-9a-f]{16})-' + UUID + '$', 'i');

function rootHash(root) {
  const normalized = resolve(root);
  return createHash('sha256').update(process.platform === 'win32' ? normalized.toLowerCase() : normalized).digest('hex').slice(0, 16);
}
function validRecord(record) {
  if (process.platform !== 'win32' || !record || typeof record !== 'object') return false;
  if (record.app !== APP || record.version !== VERSION || !['launcher', 'server'].includes(record.kind)) return false;
  if (typeof record.root !== 'string' || !isAbsolute(record.root)) return false;
  if (!Number.isSafeInteger(record.pid) || record.pid <= 0 || typeof record.token !== 'string' || !/^[0-9a-f]{64}$/i.test(record.token)) return false;
  if (typeof record.pipeName !== 'string') return false;
  const endpoint = PIPE_PATTERN.exec(record.pipeName);
  return !!endpoint && endpoint[1].toLowerCase() === rootHash(record.root);
}
function tokenMatches(candidate, token) {
  if (typeof candidate !== 'string' || !/^[0-9a-f]{64}$/i.test(candidate)) return false;
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(token, 'hex'));
}

/** Register only this process's project session. No HTTP or TCP stop endpoint. */
export async function registerSession({ root, kind, onStop }) {
  if (process.platform !== 'win32') throw new Error('本机会话控制仅支持 Windows 命名管道。');
  if (typeof root !== 'string' || !isAbsolute(root)) throw new TypeError('会话 root 必须是项目的绝对路径。');
  if (!['launcher', 'server'].includes(kind)) throw new TypeError('会话 kind 必须是 launcher 或 server。');
  if (typeof onStop !== 'function') throw new TypeError('会话必须提供 onStop 回调。');
  root = resolve(root);
  const id = randomUUID(), directory = join(root, '.runtime', 'sessions');
  const recordPath = join(directory, `${kind}-${process.pid}-${id}.json`);
  const temporaryPath = recordPath + '.tmp';
  const record = Object.freeze({ app: APP, version: VERSION, root, pid: process.pid, kind,
    token: randomBytes(32).toString('hex'), pipeName: `${PIPE_PREFIX}${rootHash(root)}-${id}` });
  const sockets = new Set();
  let disposed = false, disposePromise = null, stopRequested = false, published = false, serverError = null;

  const server = createServer(socket => {
    if (disposed) { socket.destroy(); return; }
    sockets.add(socket); socket.unref();
    let buffer = '', bytes = 0, answered = false;
    function reply(ok, shouldStop = false) {
      if (answered || socket.destroyed) return;
      answered = true; clearTimeout(readTimer);
      // Flush the acknowledgement before onStop can dispose the session/server.
      socket.end(JSON.stringify({ ok }) + '\n', () => {
        socket.destroy();
        if (shouldStop) {
          Promise.resolve().then(onStop).catch(error => {
            console.error('停止本机游戏会话时发生错误：', error);
          });
        }
      });
    }
    const readTimer = setTimeout(() => reply(false), READ_TIMEOUT_MS);
    readTimer.unref();
    socket.on('error', () => socket.destroy());
    socket.on('close', () => { clearTimeout(readTimer); sockets.delete(socket); });
    socket.on('data', chunk => {
      if (answered || disposed) return;
      bytes += chunk.length;
      if (bytes > MAX_MESSAGE_BYTES) { reply(false); return; }
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      let message;
      try { message = JSON.parse(buffer.slice(0, newline)); }
      catch { reply(false); return; }
      if (buffer.slice(newline + 1).trim() || !message || Array.isArray(message)
        || message.command !== 'stop' || !tokenMatches(message.token, record.token)) { reply(false); return; }
      const firstRequest = !stopRequested;
      stopRequested = true;
      reply(true, firstRequest);
    });
  });

  async function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise(resolveClose => {
        if (!server.listening) { resolveClose(); return; }
        server.close(() => resolveClose());
      });
      // UUID-specific files only: never remove the shared sessions directory.
      await rm(recordPath, { force: true });
      await rm(temporaryPath, { force: true });
    })();
    return disposePromise;
  }
  server.on('error', error => {
    serverError = error;
    if (published) void dispose().catch(cleanupError => console.error('清理本机会话失败：', cleanupError));
  });
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await new Promise((resolveListen, rejectListen) => {
      const failed = error => { server.removeListener('listening', listening); rejectListen(error); };
      const listening = () => { server.removeListener('error', failed); resolveListen(); };
      server.once('error', failed); server.once('listening', listening); server.listen(record.pipeName);
    });
    server.unref();
    await writeFile(temporaryPath, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
    if (serverError || disposed) throw serverError || new Error('会话登记已取消。');
    await rename(temporaryPath, recordPath); published = true;
    if (serverError || disposed) throw serverError || new Error('会话登记已取消。');
    return { recordPath, dispose, record };
  } catch (error) {
    await dispose(); throw error;
  }
}

/** Request authenticated shutdown over a project-local Windows named pipe.
 * The caller must additionally check record.root against its intended project. */
export async function requestSessionStop(record, { timeoutMs = 2500 } = {}) {
  if (!validRecord(record) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return false;
  return new Promise(resolveResult => {
    let socket = null, timer = null, settled = false, response = '', bytes = 0;
    function finish(ok) {
      if (settled) return;
      settled = true; clearTimeout(timer); socket?.destroy(); resolveResult(ok);
    }
    try {
      socket = createConnection({ path: record.pipeName });
      timer = setTimeout(() => finish(false), Math.min(timeoutMs, 30000));
      socket.on('connect', () => socket.write(JSON.stringify({ command: 'stop', token: record.token }) + '\n'));
      socket.on('error', () => finish(false));
      socket.on('end', () => finish(false)); socket.on('close', () => finish(false));
      socket.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_MESSAGE_BYTES) { finish(false); return; }
        response += chunk.toString('utf8');
        const newline = response.indexOf('\n');
        if (newline < 0) return;
        try { finish(JSON.parse(response.slice(0, newline))?.ok === true); }
        catch { finish(false); }
      });
    } catch { finish(false); }
  });
}
