/**
 * The production asset route, driven as a real Hono route over a real
 * directory. In dev, vite serves the module graph and this route is never
 * hit — so nothing else exercises it, and a gap here is production-only
 * by construction (the FE-1361 review's verified finding: the old
 * js|css|map allowlist 404'd the first font or image the client build
 * emitted, and its UTF-8 read would have corrupted the bytes had the
 * allowlist merely grown).
 *
 * Tested against the handler module rather than the emitted server bundle,
 * because that bundle targets node (`node:sqlite`) and cannot be imported
 * under `bun test`.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { assetHandler } from '../src/assets.ts';

const uiRoot = mkdtempSync(join(tmpdir(), 'brunch-assets-'));
const BINARY_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);

mkdirSync(join(uiRoot, 'assets'));
writeFileSync(join(uiRoot, 'assets/index.js'), 'export {};\n');
writeFileSync(join(uiRoot, 'assets/index.css'), 'body {}\n');
writeFileSync(join(uiRoot, 'assets/brand.woff2'), BINARY_BYTES);
writeFileSync(join(uiRoot, 'assets/Logo.PNG'), BINARY_BYTES);
writeFileSync(join(uiRoot, 'assets/blob.dat'), BINARY_BYTES);

afterAll(() => rmSync(uiRoot, { recursive: true, force: true }));

const app = new Hono();
app.get('/assets/:file', assetHandler(pathToFileURL(`${uiRoot}/`)));

describe('the production asset route', () => {
  test('serves the build outputs with their types', async () => {
    for (const [file, type] of [
      ['index.js', 'text/javascript'],
      ['index.css', 'text/css'],
    ] as const) {
      const response = await app.request(`/assets/${file}`);
      expect({ file, status: response.status, type: response.headers.get('content-type') }).toEqual(
        { file, status: 200, type },
      );
    }
  });

  test('serves a binary asset byte-for-byte', async () => {
    // Bytes 0..255 include invalid UTF-8 sequences on purpose: a decode-then-
    // reencode anywhere on the path corrupts them, and this catches it.
    const response = await app.request('/assets/brand.woff2');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('font/woff2');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY_BYTES);
  });

  test('extension case does not decide servability', async () => {
    // Bundlers preserve source-file case in emitted names, so `Logo.PNG` is a
    // real production shape, not a hypothetical.
    const response = await app.request('/assets/Logo.PNG');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  test('an asset type nobody anticipated still serves, as octet-stream', async () => {
    // Fail open on the content-type, never on the bytes: an unknown extension
    // must not reintroduce the 404-in-production-only failure.
    const response = await app.request('/assets/blob.dat');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY_BYTES);
  });

  test('refuses traversal, hidden files, and extensionless names', async () => {
    for (const path of [
      '/assets/..%2Fsecret.js',
      '/assets/%2e%2e%2fsecret.js',
      '/assets/.env',
      '/assets/noextension',
    ]) {
      const response = await app.request(path);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
  });

  test('a missing asset is a 404, not a crash', async () => {
    const response = await app.request('/assets/never-emitted.js');
    expect(response.status).toBe(404);
  });
});
