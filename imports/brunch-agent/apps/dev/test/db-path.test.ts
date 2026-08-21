/**
 * The conversation store's default path must not depend on the launch
 * directory. The failure this pins down: a cwd-relative default meant
 * launching the app from anywhere but the package directory silently created
 * a fresh empty database — the restart-durability failure the store exists
 * to prevent, invisible until something restarted.
 *
 * Tested against `db-path.ts` rather than `db.ts`, because the adapter module
 * imports `@flue/runtime/node` and cannot be driven under `bun test` (same
 * seam as `assets.test.ts`).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { conversationDbPath } from "../src/db-path.ts";
import { targetDocumentPath } from "../src/target-document-path.ts";

const appDir = fileURLToPath(new URL("..", import.meta.url));

describe("the conversation store path", () => {
  const originalCwd = process.cwd();
  const originalOverride = process.env.BRUNCH_DEV_DB_PATH;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalOverride === undefined) delete process.env.BRUNCH_DEV_DB_PATH;
    else process.env.BRUNCH_DEV_DB_PATH = originalOverride;
  });

  test("is anchored to the package, wherever the process was launched from", () => {
    delete process.env.BRUNCH_DEV_DB_PATH;
    const fromRepo = conversationDbPath();
    process.chdir(tmpdir());
    const fromElsewhere = conversationDbPath();

    expect(isAbsolute(fromRepo)).toBe(true);
    expect(fromElsewhere).toBe(fromRepo);
    expect(fromRepo).toBe(join(appDir, ".data-wipe-me", "conversations.db"));
  });

  test("the env override wins untouched", () => {
    process.env.BRUNCH_DEV_DB_PATH = "./relative/on-purpose.db";
    expect(conversationDbPath()).toBe("./relative/on-purpose.db");
  });

  test("a set-but-empty override falls back to the anchored default", () => {
    // sqlite('') would open an anonymous temporary database deleted on close
    // — non-durable with no error, which is this module's one job to prevent.
    process.env.BRUNCH_DEV_DB_PATH = "";
    expect(conversationDbPath()).toBe(join(appDir, ".data-wipe-me", "conversations.db"));
  });
});

describe("the target-document store path", () => {
  const originalOverride = process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR;

  afterEach(() => {
    if (originalOverride === undefined) delete process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR;
    else process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR = originalOverride;
  });

  test("uses a stable opaque filename below the host-selected directory", () => {
    process.env.BRUNCH_DEV_TARGET_DOCUMENT_DIR = "/tmp/brunch-target-documents-test";
    const first = targetDocumentPath("../shared-target");

    expect(first).toBe(targetDocumentPath("../shared-target"));
    expect(dirname(first)).toBe("/tmp/brunch-target-documents-test");
    expect(first).not.toContain("shared-target");
  });

  test("refuses an empty target-document identity", () => {
    expect(() => targetDocumentPath("")).toThrow("cannot be empty");
  });
});
