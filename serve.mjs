import {createServer} from 'node:http';
import {constants as fsConstants} from 'node:fs';
import {lstat, open, realpath, stat} from 'node:fs/promises';
import {dirname, extname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {brotliCompress, constants as zlibConstants, gzip} from 'node:zlib';
import {registerSession} from './scripts/runtime-session.mjs';

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(modulePath), 'Output');
const publicFiles = new Set([
  'index.html', '瓦雷莎·雨夜便利店.html', '使用说明.txt', '角色来源.md',
  '动作来源.md', '模型原始使用说明.txt', 'THREE-LICENSE.txt',
]);
const mimeTypes = {'.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'};
const compressGzip = promisify(gzip), compressBrotli = promisify(brotliCompress);
const error = (status, message) => Object.assign(new Error(message), {status});
const fingerprint = s => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');

function isWithin(root, filename) {
  const part = relative(root, filename);
  return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function routeName(target) {
  // Parse origin-form ourselves: URL() would normalize encoded dot segments
  // before they could be rejected. Host is deliberately never used as a base.
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) throw error(400, 'Invalid request target');
  if (target.length > 8192) throw error(414, 'Request target too long');
  let pathname;
  try { pathname = decodeURIComponent(target.split(/[?#]/, 1)[0]); }
  catch { throw error(400, 'Invalid URL encoding'); }
  if (/[\x00-\x1f\x7f\\%]/u.test(pathname) || pathname.slice(1).includes('/') || pathname.startsWith('/.')) throw error(403, 'Forbidden');
  if (pathname === '/') return 'index.html';
  if (pathname === '/__game_health') return '__game_health';
  const filename = pathname.slice(1);
  if (!publicFiles.has(filename)) throw error(404, 'Not found');
  return filename;
}

function acceptedEncoding(header) {
  const values = new Map();
  for (const item of String(header || '').split(',')) {
    const [rawName, ...parameters] = item.trim().toLowerCase().split(';');
    if (!rawName) continue;
    const qualityParameter = parameters.find(p => /^\s*q\s*=/u.test(p));
    const quality = qualityParameter ? Number(qualityParameter.split('=')[1].trim()) : 1;
    values.set(rawName, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0);
  }
  const identityAllowed = (values.get('identity') ?? (values.get('*') === 0 ? 0 : 1)) > 0;
  let selected = identityAllowed ? 'identity' : null;
  let bestQuality = values.get('identity') ?? 0;
  // An implicit identity is the fallback, while equal compressed qualities
  // prefer Brotli. An explicit higher identity quality is respected.
  for (const encoding of ['gzip', 'br']) {
    const quality = values.get(encoding) ?? values.get('*') ?? 0;
    if (quality > 0 && quality >= bestQuality) { selected = encoding; bestQuality = quality; }
  }
  if (!selected) throw error(406, 'No acceptable content encoding');
  return selected;
}

function matchesETag(header, etag) {
  return String(header || '').split(',').some(value => {
    const candidate = value.trim();
    return candidate === '*' || candidate.replace(/^W\//u, '') === etag;
  });
}

/** Start a private static game server. The launcher owns port selection and
 * must handle EADDRINUSE rather than trusting an unrelated existing service. */
export async function createGameServer({host = '127.0.0.1', port = 4180, root = defaultRoot, instanceId = randomUUID()} = {}) {
  const canonicalRoot = await realpath(resolve(root));
  if (!(await stat(canonicalRoot)).isDirectory()) throw Object.assign(new Error('Game root is not a directory'), {code: 'ENOTDIR'});
  const health = Buffer.from(JSON.stringify({app: 'ame-machi-miniature', instanceId}));
  const cache = new Map();

  async function publicAsset(filename) {
    const pathname = join(canonicalRoot, filename);
    const before = await lstat(pathname, {bigint: true});
    if (!before.isFile() || before.isSymbolicLink()) throw error(403, 'Forbidden');
    if (!isWithin(canonicalRoot, await realpath(pathname))) throw error(403, 'Forbidden');
    const stamp = fingerprint(before), cached = cache.get(filename);
    if (cached?.stamp === stamp) return cached.pending;

    const pending = (async () => {
      // NOFOLLOW protects the final component on Unix; on Windows the inode
      // and post-open canonical-path checks also reject reparse-point swaps.
      const flags = fsConstants.O_RDONLY | (process.platform === 'win32' ? 0 : (fsConstants.O_NOFOLLOW || 0));
      const file = await open(pathname, flags);
      try {
        const opened = await file.stat({bigint: true});
        if (!opened.isFile() || fingerprint(opened) !== stamp || !isWithin(canonicalRoot, await realpath(pathname))) throw error(403, 'Forbidden');
        const bytes = await file.readFile();
        if (fingerprint(await file.stat({bigint: true})) !== stamp) throw error(503, 'Game file is being updated');
        const hash = createHash('sha256').update(bytes).digest('base64url');
        return {
          bytes, hash, modified: Number(opened.mtimeMs), type: mimeTypes[extname(filename)],
          representations: new Map([['identity', Promise.resolve(bytes)]]),
        };
      } finally { await file.close(); }
    })();
    cache.set(filename, {stamp, pending});
    try { return await pending; }
    catch (failure) { if (cache.get(filename)?.pending === pending) cache.delete(filename); throw failure; }
  }

  async function representation(asset, encoding) {
    if (!asset.representations.has(encoding)) {
      const pending = encoding === 'br'
        ? compressBrotli(asset.bytes, {params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 4}})
        : compressGzip(asset.bytes, {level: 6});
      asset.representations.set(encoding, pending);
      pending.catch(() => { if (asset.representations.get(encoding) === pending) asset.representations.delete(encoding); });
    }
    return asset.representations.get(encoding);
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD'); throw error(405, 'Method not allowed');
      }
      const filename = routeName(req.url);
      if (filename === '__game_health') {
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Content-Length': health.length, 'Cache-Control': 'no-store'});
        res.end(req.method === 'HEAD' ? undefined : health); return;
      }
      const asset = await publicAsset(filename), encoding = acceptedEncoding(req.headers['accept-encoding']);
      const etag = `"${asset.hash}-${encoding}"`;
      const headers = {
        'Content-Type': asset.type, 'Cache-Control': 'public, max-age=0, must-revalidate',
        'Vary': 'Accept-Encoding', 'ETag': etag, 'Last-Modified': new Date(asset.modified).toUTCString(),
      };
      if (encoding !== 'identity') headers['Content-Encoding'] = encoding;
      const unchanged = req.headers['if-none-match'] !== undefined
        ? matchesETag(req.headers['if-none-match'], etag)
        : Number.isFinite(Date.parse(req.headers['if-modified-since'])) && Math.floor(asset.modified / 1000) * 1000 <= Date.parse(req.headers['if-modified-since']);
      if (unchanged) { res.writeHead(304, headers); res.end(); return; }
      const bytes = await representation(asset, encoding);
      res.writeHead(200, {...headers, 'Content-Length': bytes.length});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (failure) {
      const status = failure.status || (failure.code === 'ENOENT' || failure.code === 'ENOTDIR' ? 404 : failure.code === 'ELOOP' ? 403 : 500);
      const message = failure.status ? failure.message : status === 404 ? 'Not found' : status === 403 ? 'Forbidden' : 'Unable to load game file';
      const body = Buffer.from(message);
      res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : body);
    }
  });
  await new Promise((resolveListening, reject) => {
    const failed = failure => { server.off('listening', listening); reject(failure); };
    const listening = () => { server.off('error', failed); resolveListening(); };
    server.once('error', failed); server.once('listening', listening);
    try { server.listen(port, host); } catch (failure) { server.off('error', failed); server.off('listening', listening); reject(failure); }
  });
  return server;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  createGameServer().then(async server => {
    let session,stopped=false;
    const stop=async()=>{
      if(stopped)return;stopped=true;server.close();server.closeAllConnections();
      await session?.dispose();
      for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,stop);
      console.log('Game server stopped.');
    };
    try{
      session=await registerSession({root:dirname(modulePath),kind:'server',onStop:stop});
      if(stopped){await session.dispose();return;}
      for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,stop);
      console.log(`Scene preview: http://127.0.0.1:${server.address().port}`);
    }catch(failure){await stop();throw failure;}
  }).catch(failure => {
    console.error(`Unable to start game server: ${failure.code || failure.message}`);
    process.exitCode = 1;
  });
}
