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

import { fileURLToPath } from "node:url";

import { brunchEnv } from "@hashintel/brunch-agent";

export function conversationDbPath(): string {
  // Truthiness, not nullish, on purpose: a set-but-empty override would pass
  // '' through to sqlite(), which opens an anonymous temporary database
  // deleted on close — silently non-durable again.
  const override = process.env[brunchEnv.devDbPath];
  return override
    ? override
    : fileURLToPath(
        new URL("../.data-wipe-me/conversations.db", import.meta.url),
      );
}
