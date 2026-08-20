/**
 * Production asset serving — everything the client build emits, not an
 * extension allowlist.
 *
 * The FE-1361 review verified the failure the old inline route carried: it
 * allowlisted `js|css|map` and read hits as UTF-8, so the first font or image
 * the client build emitted would 404 in production while vite dev served it
 * fine — and widening the allowlist without dropping the UTF-8 read would
 * have corrupted binary bytes instead. So: any flat, extension-bearing file
 * name serves, read as bytes; the content-type map fails open to
 * `application/octet-stream` rather than failing the asset.
 */

import { readFile } from 'node:fs/promises';
import type { Context } from 'hono';

/**
 * The shape of a servable name: flat (path traversal would otherwise read
 * anything on disk relative to the bundle), not dot-led (no hidden files),
 * carrying a real extension. Everything the client build emits under
 * `assets/` looks like this.
 */
const SERVABLE_ASSET = /^[\w-][\w.-]*\.([a-z0-9]+)$/i;

/**
 * Types for what the client build emits today and plausibly tomorrow. An
 * extension missing here still serves — as `application/octet-stream` — so
 * an unforeseen asset kind degrades to a pickier content-type, never to a
 * production-only 404. The one type that must be exact is `text/css`:
 * browsers refuse stylesheets served as anything else.
 */
const ASSET_TYPES: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  css: 'text/css',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  mjs: 'text/javascript',
  otf: 'font/otf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  txt: 'text/plain',
  wasm: 'application/wasm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** Serve `assets/:file` from the client build rooted at `uiRoot`. */
export function assetHandler(uiRoot: URL): (c: Context) => Promise<Response> {
  return async (c) => {
    const file = c.req.param('file');
    // Case-folded: bundlers preserve source-file case, so a `Logo.PNG` in the
    // ui tree emits as-is and must serve — the vite-dev-works/production-404s
    // seam again. `Object.hasOwn` keeps a name like `x.constructor` from
    // reaching the prototype chain instead of the map.
    const extension = (file ? SERVABLE_ASSET.exec(file)?.[1] : undefined)?.toLowerCase();
    if (!extension) return c.notFound();
    try {
      const body = await readFile(new URL(`assets/${file}`, uiRoot));
      return c.body(new Uint8Array(body), 200, {
        'content-type': Object.hasOwn(ASSET_TYPES, extension)
          ? ASSET_TYPES[extension]!
          : 'application/octet-stream',
      });
    } catch {
      return c.notFound();
    }
  };
}
