/**
 * Keycap labels for a command's `shortcut`: `mod+shift+z` renders as
 * `["⌘", "⇧", "Z"]` on Apple platforms and `["Ctrl", "Shift", "Z"]`
 * elsewhere. Display only: binding keys is a dispatcher's job.
 */

const KEY_LABELS: Record<string, readonly [apple: string, other: string]> = {
  mod: ["⌘", "Ctrl"],
  ctrl: ["⌃", "Ctrl"],
  alt: ["⌥", "Alt"],
  shift: ["⇧", "Shift"],
  enter: ["↩", "Enter"],
  backspace: ["⌫", "Backspace"],
  escape: ["Esc", "Esc"],
  delete: ["Del", "Del"],
  space: ["Space", "Space"],
  arrowup: ["↑", "↑"],
  arrowdown: ["↓", "↓"],
  arrowleft: ["←", "←"],
  arrowright: ["→", "→"],
};

const isApplePlatform = (): boolean =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

/**
 * Splits a `+`-separated shortcut into keycap labels. Unknown single
 * characters are uppercased; other unknown keys keep an initial capital.
 * Pass `apple` to pin the platform (tests, SSR).
 */
export function formatShortcutKeys(
  shortcut: string,
  options?: { apple?: boolean },
): string[] {
  const column = (options?.apple ?? isApplePlatform()) ? 0 : 1;
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((key) => key.length > 0)
    .map(
      (key) =>
        KEY_LABELS[key]?.[column] ??
        (key.length === 1
          ? key.toUpperCase()
          : key.charAt(0).toUpperCase() + key.slice(1)),
    );
}
