import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractTunnelUrl, createTunnelObserver, startQuickTunnel, cloudflaredArgs, describeTunnelFailure } from '../scripts/tunnel.mjs';

const publicUrl = 'https://quiet-rain-123.trycloudflare.com';
const registered = '2026-09-12T15:00:00Z INF Registered tunnel connection connIndex=0 protocol=quic';

test('an already cancelled launch cannot create logs or spawn a tunnel',()=>{
  const controller=new AbortController();controller.abort(new Error('cancelled before launch'));
  assert.throws(()=>startQuickTunnel({signal:controller.signal}),/cancelled before launch/);
});

describe('Cloudflare quick-tunnel URL recognition', () => {
  test('accepts only a complete one-label HTTPS origin and normalizes its optional root slash', () => {
    assert.equal(extractTunnelUrl(publicUrl), publicUrl);
    assert.equal(extractTunnelUrl(`${publicUrl}/`), publicUrl);
    assert.equal(extractTunnelUrl(`| Your quick Tunnel: ${publicUrl} |`), publicUrl);
    assert.equal(extractTunnelUrl(`Tunnel URL: "${publicUrl}/"`), publicUrl);
    assert.equal(extractTunnelUrl('https://a.trycloudflare.com'), 'https://a.trycloudflare.com');
    const longestLabel = 'a'.repeat(63);
    assert.equal(extractTunnelUrl(`https://${longestLabel}.trycloudflare.com`), `https://${longestLabel}.trycloudflare.com`);
  });

  test('rejects suffix spoofing, nested domains, credentials, ports and non-root URLs', () => {
    const invalid = [
      'http://quiet-rain-123.trycloudflare.com',
      'https://trycloudflare.com',
      'https://one.two.trycloudflare.com',
      `${publicUrl}.evil.example`,
      `${publicUrl}.evil.example/path`,
      `${publicUrl}@evil.example`,
      'https://user@quiet-rain-123.trycloudflare.com',
      'https://user:pass@quiet-rain-123.trycloudflare.com',
      `${publicUrl}:443`, `${publicUrl}:8443`,
      `${publicUrl}/private`, `${publicUrl}//`, `${publicUrl}/../`, `${publicUrl}/%2e%2e/`,
      `${publicUrl}?token=value`, `${publicUrl}/?token=value`, `${publicUrl}#section`,
      'https://-bad.trycloudflare.com', 'https://bad-.trycloudflare.com',
      'https://bad_name.trycloudflare.com', `https://${'a'.repeat(64)}.trycloudflare.com`
    ];
    for (const value of invalid) assert.equal(extractTunnelUrl(value), null, `Rejected tunnel candidate: ${value}`);
  });

  test('official documentation and ordinary Cloudflare URLs are not public tunnel origins', () => {
    const docs = 'See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ and https://www.cloudflare.com/';
    assert.equal(extractTunnelUrl(docs), null);
    assert.equal(extractTunnelUrl(`${docs}\n| ${publicUrl} |`), publicUrl);
  });
});

describe('Tunnel readiness from complete streamed log records', () => {
  test('a URL alone is not ready; registration then reports the public origin exactly once', () => {
    const ready = [], observer = createTunnelObserver(url => ready.push(url));
    assert.equal(observer.url, null); assert.equal(observer.connected, false);
    observer.push(`| ${publicUrl}/ |\n`);
    assert.equal(observer.url, publicUrl); assert.equal(observer.connected, false);
    assert.deepEqual(ready, []);
    observer.push(`${registered}\n`);
    assert.equal(observer.connected, true); assert.deepEqual(ready, [publicUrl]);
    observer.push(`${registered}\n| ${publicUrl} |\n${registered}\n`);
    observer.push('INF Registered tunnel connection connIndex=1 protocol=quic\n');
    assert.deepEqual(ready, [publicUrl], 'Reconnects and repeated banner lines must not announce readiness again');
  });

  test('registration may precede the URL and chunk boundaries may split either marker', () => {
    const ready = [], observer = createTunnelObserver(url => ready.push(url));
    const firstRecord = Buffer.from(`${registered}\r\n`);
    for (let i = 0; i < firstRecord.length; i += 7) observer.push(firstRecord.subarray(i, i + 7));
    assert.equal(observer.connected, true); assert.equal(observer.url, null); assert.deepEqual(ready, []);
    const banner = `INF quick Tunnel created\n| ${publicUrl} |\r\n`;
    for (const character of banner) observer.push(character);
    assert.equal(observer.url, publicUrl); assert.deepEqual(ready, [publicUrl]);
  });

  test('an incomplete domain prefix cannot announce a spoofed URL before the rest of its line arrives', () => {
    const ready = [], observer = createTunnelObserver(url => ready.push(url));
    observer.push(`${registered}\n`);
    observer.push(publicUrl);
    assert.equal(observer.url, null); assert.deepEqual(ready, [], 'A chunk boundary is not the end of a log record');
    observer.push('.evil.example\n');
    assert.equal(observer.url, null); assert.deepEqual(ready, []);
    observer.push(publicUrl); observer.push('/private\n');
    assert.equal(observer.url, null); assert.deepEqual(ready, []);
    observer.push(`| ${publicUrl}/ |`);
    assert.deepEqual(ready, []);
    observer.push('\n');
    assert.deepEqual(ready, [publicUrl]);
  });

  test('documentation, startup and connection attempts do not substitute for the two readiness signals', () => {
    const ready = [], observer = createTunnelObserver(url => ready.push(url));
    observer.push('INF Starting tunnel\nINF Initial protocol quic\n');
    observer.push('Read https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/\n');
    assert.equal(observer.connected, false); assert.equal(observer.url, null); assert.deepEqual(ready, []);
    observer.push(`${registered}\n`);
    assert.equal(observer.connected, true); assert.equal(observer.url, null); assert.deepEqual(ready, []);
    observer.push(`Visit ${publicUrl}\n`);
    assert.deepEqual(ready, [publicUrl]);
  });
});

describe('Tunnel transport selection and actionable failures', () => {
  test('CLI arguments use automatic transport and preserve the local URL and config as separate tokens', () => {
    const localUrl = 'http://127.0.0.1:4301', configPath = 'D:\\Game Workspace\\.runtime\\quick-tunnel.yml';
    const args = cloudflaredArgs({ localUrl, configPath });
    assert.ok(Array.isArray(args));
    assert.equal(args[0], 'tunnel');
    for (const [flag, value] of [['--protocol', 'auto'], ['--config', configPath], ['--url', localUrl]]) {
      assert.equal(args.filter(arg => arg === flag).length, 1, `${flag} must appear once`);
      assert.equal(args[args.indexOf(flag) + 1], value, `${flag} must have its own unchanged value token`);
    }
    assert.equal(args.includes('http2'), false, 'A network with working QUIC must not be forced onto blocked HTTP/2');
  });

  test('the actual HTTP2-blocked but QUIC-successful incident takes precedence over its TLS EOF symptoms', () => {
    // Relevant lines from tunnel-e88d8726-dbd5-47fd-80fd-7d732673a068.log.
    // Keep the fixture local and deterministic; no live tunnel is launched.
    const tls = 'ERR Unable to establish connection with Cloudflare edge error="TLS handshake with edge error: EOF"';
    const records = [
      `${tls}\nINF | UDP Connectivity region1.v2.argotunnel.com PASS QUIC connection successful |\nINF | TCP Connectivity region1.v2.argotunnel.com FAIL HTTP/2 connection is blocked or unreachable |\n${tls}`,
      `${tls}\nINF precheck component="UDP Connectivity" details="QUIC connection successful" status=pass target=region1.v2.argotunnel.com\nINF precheck component="TCP Connectivity" details="HTTP/2 connection is blocked or unreachable" status=fail target=region1.v2.argotunnel.com\n${tls}`
    ];
    for (const record of records) {
      const hint = describeTunnelFailure(record);
      assert.match(hint, /HTTP\/?2|TCP/i, 'The message must identify the failed TCP transport');
      assert.match(hint, /QUIC/i, 'The working QUIC path must be called out');
      assert.match(hint, /自动/, 'Recommend automatic transport selection for this incident');
      assert.match(hint, /[\u3400-\u9fff]/, 'The actionable message must be in Chinese');
    }
  });

  test('DNS, independent TLS failures and QUIC timeouts get distinct, specific Chinese guidance', () => {
    const unknown = describeTunnelFailure('INF tunnel launch ended without diagnostic details');
    const cases = [
      ['ERR lookup region1.v2.argotunnel.com: no such host', /DNS|域名|解析/i],
      ['INF | DNS Resolution region1.v2.argotunnel.com FAIL DNS lookup failed |', /DNS|域名|解析/i],
      ['ERR Unable to establish connection with Cloudflare edge error="TLS handshake with edge error: EOF"', /TLS|握手/i],
      ['ERR Failed to dial a quic connection error="timeout: no recent network activity"', /QUIC|UDP/i]
    ];
    for (const [record, cause] of cases) {
      const hint = describeTunnelFailure(record);
      assert.match(hint, cause);
      assert.match(hint, /[\u3400-\u9fff]/);
      assert.notEqual(hint, unknown, 'A recognized cause must not fall back to the undiagnosed message');
    }
  });

  test('unknown or empty logs fall back to useful general network guidance', () => {
    for (const record of ['', 'INF tunnel launch ended without diagnostic details']) {
      const hint = describeTunnelFailure(record);
      assert.equal(typeof hint, 'string');
      assert.match(hint, /网络|连接|防火墙/);
      assert.match(hint, /检查|重试|稍后|切换|尝试/);
    }
  });
});
