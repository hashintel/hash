/**
 * The conversation store's default path must not depend on the launch
 * directory. The failure this pins down: a cwd-relative default meant
 * launching the app from anywhere but the package directory silently created
 * a fresh empty database — the restart-durability failure the store exists
 * to prevent, invisible until something restarted.
 *
 * Tested against `db-path.ts` rather than `db.ts` so path policy remains
 * isolated from the Flue Node runtime and SQLite (the same seam as
 * `assets.test.ts`).
 */

import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { conversationDbPath, captureStorePath } from "../src/db-path";

const appDir = fileURLToPath(new URL("..", import.meta.url));

describe("the conversation store path", () => {
  const originalCwd = process.cwd();
  const originalOverride = process.env.BRUNCH_DEV_DB_PATH;
  const originalChatDb = process.env.BRUNCH_CHAT_DB_PATH;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalOverride === undefined) delete process.env.BRUNCH_DEV_DB_PATH;
    else process.env.BRUNCH_DEV_DB_PATH = originalOverride;
    if (originalChatDb === undefined) delete process.env.BRUNCH_CHAT_DB_PATH;
    else process.env.BRUNCH_CHAT_DB_PATH = originalChatDb;
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
    expect(conversationDbPath()).toBe(
      join(appDir, ".data-wipe-me", "conversations.db"),
    );
  });
});

describe("the capture store path", () => {
  const originalChatDb = process.env.BRUNCH_CHAT_DB_PATH;
  const originalOverride = process.env.BRUNCH_DEV_DB_PATH;

  afterEach(() => {
    if (originalChatDb === undefined) delete process.env.BRUNCH_CHAT_DB_PATH;
    else process.env.BRUNCH_CHAT_DB_PATH = originalChatDb;
    if (originalOverride === undefined) delete process.env.BRUNCH_DEV_DB_PATH;
    else process.env.BRUNCH_DEV_DB_PATH = originalOverride;
  });

  test("sits beside the conversation database, named by Flue instance id", () => {
    delete process.env.BRUNCH_CHAT_DB_PATH;
    delete process.env.BRUNCH_DEV_DB_PATH;
    expect(captureStorePath("flue-instance-1")).toBe(
      join(appDir, ".data-wipe-me", "flue-instance-1.json"),
    );
  });

  test("follows the hermetic chat database directory", () => {
    process.env.BRUNCH_CHAT_DB_PATH = join(tmpdir(), "conversations.db");
    expect(captureStorePath("flue-instance-1")).toBe(
      join(tmpdir(), "flue-instance-1.json"),
    );
  });
});
