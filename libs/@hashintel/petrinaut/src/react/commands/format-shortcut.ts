/**
 * Keycap labels for a command's `shortcut`: `mod+shift+z` renders as
 * `["⇧", "⌘", "Z"]` on Apple platforms and `["Ctrl", "Shift", "Z"]`
 * elsewhere. Display only: binding keys is a dispatcher's job.
 */

import { detectPlatform, resolveKeys } from "@hashintel/ds-components";

/**
 * Splits a `+`-separated shortcut into keycap labels, modifiers first.
 * Unknown single characters are uppercased; other unknown keys keep an
 * initial capital. Pass `apple` to pin the platform (tests, SSR).
 */
export function formatShortcutKeys(
  shortcut: string,
  options?: { apple?: boolean },
): string[] {
  const apple = options?.apple ?? detectPlatform() === "apple";
  return resolveKeys(shortcut, apple ? "apple" : "pc").map((key) => key.label);
}
