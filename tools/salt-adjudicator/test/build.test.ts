import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const toolRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

test("builds one deterministic HTML document with no external assets", async () => {
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "salt-adjudicator-"),
  );
  const firstOutput = resolve(temporaryDirectory, "first.html");
  const secondOutput = resolve(temporaryDirectory, "second.html");

  try {
    await execFileAsync(process.execPath, [
      resolve(toolRoot, "build.ts"),
      "--out",
      firstOutput,
    ]);
    await execFileAsync(process.execPath, [
      resolve(toolRoot, "build.ts"),
      "--out",
      secondOutput,
    ]);

    const [first, second, committed] = await Promise.all([
      readFile(firstOutput, "utf8"),
      readFile(secondOutput, "utf8"),
      readFile(resolve(toolRoot, "salt-adjudicator.html"), "utf8"),
    ]);
    assert.equal(first, second);
    assert.equal(
      first,
      committed,
      "The committed artifact must match the source.",
    );
    assert.ok(
      Buffer.byteLength(first) < 300_000,
      "The standalone artifact must stay below 300 KB.",
    );
    assert.match(first, /^<!doctype html>/u);
    assert.match(first, /<style>[\s\S]+<\/style>/u);
    const inlinedStyles = first.match(/<style>([\s\S]+?)<\/style>/u)?.[1];
    assert.ok(inlinedStyles);
    assert.doesNotMatch(inlinedStyles, /@import\b|url\s*\(/iu);
    assert.match(first, /"kind":"generic"/u);
    assert.match(first, /SALT demonstration study/u);
    assert.match(first, /Geometry class guide/u);
    assert.match(first, /They are the same thing, recorded twice\./u);
    assert.doesNotMatch(first, /[ \t]+$/mu);
    assert.doesNotMatch(first, /<script\b[^>]*\bsrc=/iu);
    assert.doesNotMatch(first, /<link\b[^>]*\bhref=/iu);
    assert.doesNotMatch(
      first,
      /<(?:audio|iframe|img|source|video)\b[^>]*\bsrc=/iu,
    );
    assert.doesNotMatch(first, /<script\b[^>]*\btype=["']module["']/iu);
    assert.doesNotMatch(
      first,
      /\b(?:EventSource|WebSocket|XMLHttpRequest|fetch|sendBeacon)\s*\(/u,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
