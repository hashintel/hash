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

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Hono } from "hono";

import { assetHandler } from "../src/assets.ts";

const uiRoot = mkdtempSync(join(tmpdir(), "brunch-assets-"));
const BINARY_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i);

/**
 * Names a bundler can legally emit, because `[name]` in `assetFileNames` is the
 * source basename and neither vite nor rollup reduces it to `[\w.-]`. Each file
 * holds its own name as its body, so serving the wrong file is a failure rather
 * than a coincidental pass.
 */
const PRODUCER_PUNCTUATION = [
  "logo (1).png",
  "café.woff2",
  "a+b,c'd.js",
  "x#y.js",
  "q?z.js",
  "@scope~thing.js",
] as const;

mkdirSync(join(uiRoot, "assets/fonts"), { recursive: true });
// A directory whose name looks like an asset: reading it is EISDIR, which is an
// expected absence rather than a fault.
mkdirSync(join(uiRoot, "assets/legacy.js"), { recursive: true });
writeFileSync(join(uiRoot, "assets/index.js"), "export {};\n");
writeFileSync(join(uiRoot, "assets/index.css"), "body {}\n");
writeFileSync(join(uiRoot, "assets/brand.woff2"), BINARY_BYTES);
writeFileSync(join(uiRoot, "assets/Logo.PNG"), BINARY_BYTES);
writeFileSync(join(uiRoot, "assets/blob.dat"), BINARY_BYTES);
writeFileSync(join(uiRoot, "assets/fonts/nested.woff2"), BINARY_BYTES);
for (const name of PRODUCER_PUNCTUATION) writeFileSync(join(uiRoot, `assets/${name}`), name);
// Outside `assets/`, so a traversal that escapes has something to find: a 404
// on a path that leads nowhere proves nothing about refusal.
writeFileSync(join(uiRoot, "secret.js"), "SECRET\n");
// A symlink to itself: reading it is ELOOP, a broken tree rather than a missing
// file, and nothing about it should read as "this asset was never emitted".
symlinkSync("loop.js", join(uiRoot, "assets/loop.js"));

afterAll(() => rmSync(uiRoot, { recursive: true, force: true }));

const app = new Hono();
app.get("/assets/*", assetHandler(pathToFileURL(`${uiRoot}/`)));

describe("the production asset route", () => {
  test("serves the build outputs with their types", async () => {
    for (const [file, type] of [
      ["index.js", "text/javascript; charset=utf-8"],
      ["index.css", "text/css; charset=utf-8"],
    ] as const) {
      const response = await app.request(`/assets/${file}`);
      expect({
        file,
        status: response.status,
        type: response.headers.get("content-type"),
      }).toEqual({ file, status: 200, type });
    }
  });

  test("serves a nested asset path", async () => {
    // Bundlers emit nested paths (assets/fonts/…); the old `:file` param
    // could never match one, so nesting was a production-only 404.
    const response = await app.request("/assets/fonts/nested.woff2");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY_BYTES);
  });

  test("serves a binary asset byte-for-byte", async () => {
    // Bytes 0..255 include invalid UTF-8 sequences on purpose: a decode-then-
    // reencode anywhere on the path corrupts them, and this catches it.
    const response = await app.request("/assets/brand.woff2");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY_BYTES);
  });

  test("extension case does not decide servability", async () => {
    // Bundlers preserve source-file case in emitted names, so `Logo.PNG` is a
    // real production shape, not a hypothetical.
    const response = await app.request("/assets/Logo.PNG");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  test("an asset type nobody anticipated still serves, as octet-stream", async () => {
    // Fail open on the content-type, never on the bytes: an unknown extension
    // must not reintroduce the 404-in-production-only failure.
    const response = await app.request("/assets/blob.dat");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BINARY_BYTES);
  });

  test("every name the producer can legally emit serves, punctuation and all", async () => {
    // The old grammar accepted only `[\w.-]`, so each of these 404'd in
    // production while vite dev served it — and `#` and `?` additionally break
    // the URL the handler builds, silently addressing a different file.
    for (const name of PRODUCER_PUNCTUATION) {
      const response = await app.request(`/assets/${encodeURIComponent(name)}`);
      expect({
        name,
        status: response.status,
        body: await response.text(),
      }).toEqual({
        name,
        status: 200,
        body: name,
      });
    }
  });

  test("refuses traversal, hidden files, extensionless names, and nul bytes", async () => {
    for (const path of [
      "/assets/..%2Fsecret.js",
      "/assets/%2e%2e%2fsecret.js",
      "/assets/../secret.js",
      "/assets/fonts/../../secret.js",
      // A backslash is a path separator to the URL parser under the file:
      // scheme, so this escapes `assets/` if the path reaches the URL raw.
      "/assets/..%5Csecret.js",
      "/assets/..%5C..%5Csecret.js",
      "/assets/.env",
      "/assets/fonts/.hidden.js",
      "/assets/noextension",
      // Refused before the filesystem sees it: a nul byte is a TypeError from
      // readFile, not an errno, so translating it would mean catching broadly.
      "/assets/a%00b.js",
    ]) {
      const response = await app.request(path);
      expect({
        path,
        status: response.status,
        leaked: (await response.text()).includes("SECRET"),
      }).toEqual({ path, status: 404, leaked: false });
    }
  });

  test("every way a path can be absent is a 404, not a crash", async () => {
    for (const [path, reason] of [
      ["/assets/never-emitted.js", "ENOENT — no such file"],
      ["/assets/index.js/nested.js", "ENOTDIR — a file used as a directory"],
      ["/assets/legacy.js", "EISDIR — a directory shaped like an asset"],
      [`/assets/${"x".repeat(400)}.js`, "ENAMETOOLONG — no file can carry this name"],
    ] as const) {
      const response = await app.request(path);
      expect({ reason, status: response.status }).toEqual({
        reason,
        status: 404,
      });
    }
  });

  test("an unexpected filesystem failure propagates instead of reading as absence", async () => {
    // The broad catch this replaces turned every read failure into `notFound`,
    // so a broken build tree served a clean 404 and looked like an asset the
    // build had simply never emitted.
    let propagated: unknown;
    const guarded = new Hono();
    guarded.onError((error, c) => {
      propagated = error;
      return c.text("propagated", 500);
    });
    guarded.get("/assets/*", assetHandler(pathToFileURL(`${uiRoot}/`)));

    const response = await guarded.request("/assets/loop.js");
    expect({
      status: response.status,
      code: (propagated as NodeJS.ErrnoException | undefined)?.code,
    }).toEqual({ status: 500, code: "ELOOP" });
  });
});
