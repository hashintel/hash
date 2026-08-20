/**
 * Production asset serving — everything the client build emits, not an
 * extension allowlist.
 *
 * The FE-1361 review verified the failure the old inline route carried: it
 * allowlisted `js|css|map` and read hits as UTF-8, so the first font or image
 * the client build emitted would 404 in production while vite dev served it
 * fine — and widening the allowlist without dropping the UTF-8 read would
 * have corrupted binary bytes instead. So: any servable file name serves,
 * read as bytes; the content-type comes from hono's own MIME table and fails
 * open to `application/octet-stream` rather than failing the asset.
 *
 * Mounted as a wildcard (`/assets/*`) rather than `:file`, because a `:file`
 * param cannot match the nested paths bundlers emit (`assets/fonts/x.woff2`).
 */

import { readFile } from 'node:fs/promises';
import type { Context } from 'hono';
import { getMimeType } from 'hono/utils/mime';

/**
 * The shape of a servable path: one or more segments, none dot-led (no hidden
 * files, and `..` traversal — which would otherwise read anything on disk
 * relative to the bundle — cannot form a segment), the last carrying a real
 * extension. Everything the client build emits under `assets/` looks like
 * this.
 */
const SERVABLE_ASSET_PATH = /^(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.[a-z0-9]+$/i;

/** Serve `assets/*` from the client build rooted at `uiRoot`. */
export function assetHandler(uiRoot: URL): (c: Context) => Promise<Response> {
  return async (c) => {
    // The raw wildcard remainder, decoded here because hono decodes params
    // but not the path — an undecodable escape is a 404, not a crash.
    let file: string;
    try {
      file = decodeURIComponent(c.req.path.replace(/^\/assets\//, ''));
    } catch {
      return c.notFound();
    }
    if (!SERVABLE_ASSET_PATH.test(file)) return c.notFound();
    try {
      const body = await readFile(new URL(`assets/${file}`, uiRoot));
      // Fail open on the content-type, never on the bytes: an extension the
      // table does not know degrades to a pickier content-type, not to a
      // production-only 404.
      return c.body(new Uint8Array(body), 200, {
        'content-type': getMimeType(file) ?? 'application/octet-stream',
      });
    } catch {
      return c.notFound();
    }
  };
}
