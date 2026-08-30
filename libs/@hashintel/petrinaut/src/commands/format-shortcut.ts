/**
 * Display formatting for a command's `shortcut` string: `"mod+shift+z"`
 * becomes `["⌘", "⇧", "Z"]` on Apple platforms and `["Ctrl", "Shift", "Z"]`
 * elsewhere, ready to render as keycaps. Pure presentation — binding keys is
 * the dispatcher's job, not this module's.
 */

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i;

/** Whether the current environment uses Apple-style key symbols. */
export function isApplePlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    APPLE_PLATFORM.test(navigator.platform || navigator.userAgent)
  );
}

const APPLE_KEY_LABELS: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  cmd: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
  enter: "↩",
  backspace: "⌫",
};

const GENERIC_KEY_LABELS: Record<string, string> = {
  mod: "Ctrl",
  meta: "Win",
  cmd: "Ctrl",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  enter: "Enter",
  backspace: "Backspace",
};

const SHARED_KEY_LABELS: Record<string, string> = {
  escape: "Esc",
  delete: "Del",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/**
 * Splits a `+`-separated shortcut into platform-aware key labels, in the
 * declared order. Unknown single characters uppercase; unknown words keep an
 * initial capital. Pass `apple` explicitly to pin the platform (tests, SSR).
 */
export function formatShortcutKeys(
  shortcut: string,
  options?: { apple?: boolean },
): string[] {
  const apple = options?.apple ?? isApplePlatform();
  const platformLabels = apple ? APPLE_KEY_LABELS : GENERIC_KEY_LABELS;
  return shortcut.split("+").map((part) => {
    const key = part.trim().toLowerCase();
    const label = platformLabels[key] ?? SHARED_KEY_LABELS[key];
    if (label) {
      return label;
    }
    return key.length === 1
      ? key.toUpperCase()
      : key.charAt(0).toUpperCase() + key.slice(1);
  });
}
