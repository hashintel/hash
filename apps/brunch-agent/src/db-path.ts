/**
 * Where the conversation store lives, resolved before the adapter opens it.
 *
 * Anchored to this module's location — the way `app.ts` anchors `uiRoot` —
 * never to the launch directory: a cwd-relative default silently creates a
 * fresh empty database when the app is launched from anywhere else, which is
 * the exact restart-durability failure `db.ts` exists to prevent. From `src/`
 * and from the emitted `dist/` bundle alike, `../.data-wipe-me/` resolves to
 * the package directory.
 *
 * Kept apart from `db.ts` so path policy stays importable without loading the
 * Flue Node runtime and SQLite adapter.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const conversationDbFileFrom = (override: string): string =>
  override.endsWith(".db") ? override : join(override, "conversations.db");

export function conversationDbPath(): string {
  // Truthiness, not nullish, on purpose: a set-but-empty override would pass
  // '' through to sqlite(), which opens an anonymous temporary database
  // deleted on close — silently non-durable again.
  const override = process.env.BRUNCH_DEV_DB_PATH;
  return override
    ? override
    : fileURLToPath(
        new URL("../.data-wipe-me/conversations.db", import.meta.url),
      );
}

/**
 * Capture JSON lives beside the Flue sqlite file, named by Flue instance id.
 * The hermetic chat test sets `BRUNCH_CHAT_DB_PATH` (not `BRUNCH_DEV_DB_PATH`),
 * so that directory wins when present.
 */
export function captureStorePath(instanceId: string): string {
  if (instanceId.length === 0) {
    throw new TypeError(
      "A Flue instance id is required for the capture store path.",
    );
  }
  const chatDb = process.env.BRUNCH_CHAT_DB_PATH;
  const directory = dirname(
    chatDb ? conversationDbFileFrom(chatDb) : conversationDbPath(),
  );
  return join(directory, `${instanceId}.json`);
}
