/**
 * Display-only key resolution for `Kbd`: turns key names into the
 * label printed for each key and the name announced by assistive technology.
 * Key names are matched case-insensitively and cover hotkey-library notation
 * (`mod`, `cmd`, `esc`) as well as `KeyboardEvent.key` values (`Meta`,
 * `ArrowUp`, `" "`).
 *
 * Modifiers are moved to the front in each platform's conventional order:
 * Control, Option, Shift, Command on Apple platforms (Apple's Human Interface
 * Guidelines) and Windows, Ctrl, Alt, Shift elsewhere (Microsoft's Windows
 * guidelines). On PC the keys of a combination are also joined with `+`.
 */

export type KbdPlatform = "apple" | "pc";

export type KbdKey = {
  /** Text printed on the keycap */
  label: string;
  /** Name announced by assistive technology */
  name: string;
};

type KeyDefinition = Record<KbdPlatform, KbdKey>;

const defineKey = (
  name: string,
  appleLabel: string,
  pcLabel: string = appleLabel,
  pcName: string = name,
): KeyDefinition => ({
  apple: { label: appleLabel, name },
  pc: { label: pcLabel, name: pcName },
});

const command = defineKey("Command", "⌘", "Win", "Windows");
const control = defineKey("Control", "⌃", "Ctrl");
const option = defineKey("Option", "⌥", "Alt", "Alt");
const enter = defineKey("Return", "↩", "Enter", "Enter");
const escape = defineKey("Escape", "Esc");
const space = defineKey("Space", "Space");
const plus = defineKey("Plus", "+");
const arrowUp = defineKey("Up Arrow", "↑");
const arrowDown = defineKey("Down Arrow", "↓");
const arrowLeft = defineKey("Left Arrow", "←");
const arrowRight = defineKey("Right Arrow", "→");
const pageUp = defineKey("Page Up", "PgUp");
const pageDown = defineKey("Page Down", "PgDn");
const insert = defineKey("Insert", "Ins");
const printScreen = defineKey("Print Screen", "PrtScn");

const namedKeys = {
  mod: defineKey("Command", "⌘", "Ctrl", "Control"),
  meta: command,
  ctrl: control,
  alt: option,
  shift: defineKey("Shift", "⇧", "Shift"),
  enter,
  backspace: defineKey("Delete", "⌫", "Backspace", "Backspace"),
  delete: defineKey("Forward Delete", "⌦", "Del", "Delete"),
  escape,
  tab: defineKey("Tab", "⇥", "Tab"),
  space,
  up: arrowUp,
  down: arrowDown,
  left: arrowLeft,
  right: arrowRight,
  pageup: pageUp,
  pagedown: pageDown,
  insert,
  printscreen: printScreen,
  plus,
} satisfies Record<string, KeyDefinition>;

/**
 * A key name. The listed names have a label per platform; any other string
 * is accepted too, either as an alias of one (`cmd`, `esc`, `ArrowUp`) or
 * as a key shown as written.
 */
export type KbdKeyName = keyof typeof namedKeys | (string & {});

const keyDefinitions = new Map<string, KeyDefinition>(
  Object.entries({
    ...namedKeys,
    cmd: command,
    command,
    control,
    opt: option,
    option,
    return: enter,
    esc: escape,
    " ": space,
    arrowup: arrowUp,
    arrowdown: arrowDown,
    arrowleft: arrowLeft,
    arrowright: arrowRight,
    pgup: pageUp,
    pgdn: pageDown,
    ins: insert,
    prtscn: printScreen,
    "+": plus,
    ",": defineKey("Comma", ","),
    ".": defineKey("Period", "."),
    "/": defineKey("Slash", "/"),
    "\\": defineKey("Backslash", "\\"),
    "-": defineKey("Minus", "-"),
    "=": defineKey("Equals", "="),
    ";": defineKey("Semicolon", ";"),
    "'": defineKey("Quote", "'"),
    "[": defineKey("Left Bracket", "["),
    "]": defineKey("Right Bracket", "]"),
    "`": defineKey("Backtick", "`"),
  }),
);

/** Modifier order per platform, by announced name */
const modifierOrder: Record<KbdPlatform, readonly string[]> = {
  apple: ["Control", "Option", "Shift", "Command"],
  pc: ["Windows", "Control", "Alt", "Shift"],
};

/** Text shown between the keys of a combination */
export const keySeparator: Record<KbdPlatform, string | null> = {
  apple: null,
  pc: "+",
};

const splitKeys = (keys: KbdKeyName | readonly KbdKeyName[]): string[] =>
  typeof keys === "string"
    ? keys
        .split("+")
        .map((keyName) => keyName.trim())
        .filter((keyName) => keyName !== "")
    : keys.filter((keyName) => keyName !== "");

/**
 * Resolves `keys` — a `+`-separated string or an array of key names — for a
 * platform, modifiers first. Unknown single characters are uppercased; other
 * unknown names keep their casing beyond an initial capital (`f2` → `F2`,
 * `CapsLock` → `CapsLock`).
 */
export const resolveKeys = (
  keys: KbdKeyName | readonly KbdKeyName[],
  platform: KbdPlatform,
): KbdKey[] => {
  const order = modifierOrder[platform];
  const modifierRank = (key: KbdKey): number => {
    const rank = order.indexOf(key.name);
    return rank === -1 ? order.length : rank;
  };

  return splitKeys(keys)
    .map((keyName) => {
      const definition = keyDefinitions.get(keyName.toLowerCase());
      if (definition) {
        return definition[platform];
      }
      const label =
        keyName.length === 1
          ? keyName.toUpperCase()
          : keyName.charAt(0).toUpperCase() + keyName.slice(1);
      return { label, name: label };
    })
    .sort((first, second) => modifierRank(first) - modifierRank(second));
};

export const detectPlatform = (): KbdPlatform =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.userAgent)
    ? "apple"
    : "pc";
