/**
 * Production asset serving — everything the client build emits, not an
 * extension allowlist and not a filename grammar.
 *
 * The FE-1361 review verified the failure the old inline route carried: it
 * allowlisted `js|css|map` and read hits as UTF-8, so the first font or image
 * the client build emitted would 404 in production while vite dev served it
 * fine — and widening the allowlist without dropping the UTF-8 read would
 * have corrupted binary bytes instead. So: any safe file name serves, read as
 * bytes; the content-type comes from hono's own MIME table and fails open to
 * `application/octet-stream` rather than failing the asset.
 *
 * What counts as safe is a property of the path, not a pattern the emitted
 * names are assumed to follow. `[name]` in a bundler's `assetFileNames` is the
 * source basename, so spaces, parentheses, accents, `+`, `,`, `'`, `#` and `?`
 * are all legal output, and a grammar narrower than the producer's is a
 * production-only 404 waiting for the first asset that uses one.
 *
 * Mounted as a wildcard (`/assets/*`) rather than `:file`, because a `:file`
 * param cannot match the nested paths bundlers emit (`assets/fonts/x.woff2`).
 */

import { readFile } from 'node:fs/promises';
import type { Context } from 'hono';
import { getMimeType } from 'hono/utils/mime';

/**
 * Read failures that mean "no file at this path, and none can be": absent,
 * reached through a file, a directory rather than a file, or too long to name
 * one. Every other failure — a permission problem, a symlink cycle, an I/O
 * error — is a fault to surface, because a 404 would report a broken build tree
 * as an asset that was simply never emitted.
 */
const ABSENT_PATH_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR', 'ENAMETOOLONG']);

const isAbsentPath = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  ABSENT_PATH_CODES.has((error as NodeJS.ErrnoException).code ?? '');

/**
 * Whether a decoded path is safe to look up under the asset root: at least one
 * segment, none empty, none dot-led — which is what keeps `..` traversal and
 * hidden files out — no nul byte, which `readFile` rejects with a `TypeError`
 * rather than an errno, and an extension on the last segment.
 */
const isSafeAssetPath = (file: string): boolean => {
  if (file.includes('\0')) return false;
  const segments = file.split('/');
  return (
    segments.every((segment) => segment.length > 0 && !segment.startsWith('.')) &&
    /\.[^./]+$/.test(segments.at(-1) ?? '')
  );
};

/** Serve `assets/*` from the client build rooted at `uiRoot`. */
export function assetHandler(uiRoot: URL): (c: Context) => Promise<Response> {
  return async (c) => {
    // The raw wildcard remainder, decoded here because hono decodes params
    // but not the path — an undecodable escape is a 404, not a crash.
    let file: string;
    try {
      file = decodeURIComponent(c.req.path.replace(/^\/assets\//, ''));
    } catch (error) {
      if (error instanceof URIError) return c.notFound();
      throw error;
    }
    if (!isSafeAssetPath(file)) return c.notFound();
    // Re-encoded segment by segment on the way into the URL: to the URL parser
    // `#` opens a fragment and `?` a query, and under the file: scheme a
    // backslash is a path separator, so a name carrying any of them addresses
    // some other file — `..\` addresses one outside the asset root entirely.
    const path = new URL(
      `assets/${file
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`,
      uiRoot,
    );
    // Served as read, with no intermediate copy. The cast is a type gap, not a
    // conversion: `readFile` is typed to admit a SharedArrayBuffer-backed view,
    // which hono's body type excludes, while the value it returns always owns
    // its own ArrayBuffer.
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = (await readFile(path)) as Uint8Array<ArrayBuffer>;
    } catch (error) {
      if (isAbsentPath(error)) return c.notFound();
      throw error;
    }
    // Fail open on the content-type, never on the bytes: an extension the
    // table does not know degrades to a pickier content-type, not to a
    // production-only 404.
    return c.body(bytes, 200, {
      'content-type': getMimeType(file) ?? 'application/octet-stream',
    });
  };
}
