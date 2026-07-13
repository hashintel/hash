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
      resolve(toolRoot, "build.mjs"),
      "--out",
      firstOutput,
    ]);
    await execFileAsync(process.execPath, [
      resolve(toolRoot, "build.mjs"),
      "--out",
      secondOutput,
    ]);

    const [first, second] = await Promise.all([
      readFile(firstOutput, "utf8"),
      readFile(secondOutput, "utf8"),
    ]);
    assert.equal(first, second);
    assert.match(first, /^<!doctype html>/u);
    assert.match(first, /<style>[\s\S]+<\/style>/u);
    assert.match(first, /"kind":"generic"/u);
    assert.match(first, /SALT demonstration study/u);
    assert.doesNotMatch(first, /<script\b[^>]*\bsrc=/iu);
    assert.doesNotMatch(first, /<link\b[^>]*\bhref=/iu);
    assert.doesNotMatch(first, /<script\b[^>]*\btype=["']module["']/iu);
    assert.doesNotMatch(first, /https?:\/\//iu);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
