/**
 * Modifier-key predicates for components that bind their own keys.
 *
 * A held modifier usually turns a key into a different command, so a binding
 * on the bare key must not fire. Which modifiers matter depends on the key:
 *
 * - Ctrl/Alt/Meta rebind almost any key: Cmd+Left is "caret to line start"
 *   (and browser Back outside editable context) on macOS, Alt+Left is word
 *   movement on macOS and browser Back on Windows/Linux, Ctrl+Tab switches
 *   browser tabs, Ctrl/Cmd+Enter are app-level submit chords.
 * - Shift additionally matters for caret-moving keys (arrows, Home/End),
 *   where it extends the selection — but not for activation keys, where
 *   platforms treat Shift+Enter/Space like the bare key (native buttons
 *   activate regardless of modifier state).
 *
 * This mirrors ark-ui/zag's own conventions (`isModifierKey` =
 * ctrl|alt|meta; typeahead requires no ctrl/meta) so wrapped machines and
 * our additions gate consistently. Escape is deliberately not gated
 * anywhere: zag's dismiss layer closes on any Escape, modifiers included.
 *
 * References for expected per-platform bindings:
 * - WAI-ARIA APG patterns, "Keyboard Interaction" per widget:
 *   https://www.w3.org/WAI/ARIA/apg/patterns/
 * - W3C UI Events key semantics: https://www.w3.org/TR/uievents-key/
 * - macOS text-system bindings (Cmd=line/doc, Option=word):
 *   https://developer.apple.com/design/human-interface-guidelines/keyboards
 *   and NSStandardKeyBindingResponding
 * - Windows (Ctrl=word, Alt+arrows=history):
 *   https://learn.microsoft.com/windows/apps/design/input/keyboard-interactions
 * - GNOME HIG keyboard reference for Linux/GTK:
 *   https://developer.gnome.org/hig/reference/keyboard.html
 * - zag-js `dom-query` event helpers and react-aria's selection/focus hooks,
 *   as reference implementations of these rules.
 */

type ModifierState = Pick<
  React.KeyboardEvent,
  "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
>;

/** The event is a command chord, not the bare key (activation keys, list
 * navigation). */
export const hasCommandModifier = (event: ModifierState): boolean =>
  event.ctrlKey || event.altKey || event.metaKey;

/** Like {@link hasCommandModifier}, but for caret-moving keys near text
 * inputs, where Shift (selection extension) also changes the meaning. */
export const hasCaretModifier = (event: ModifierState): boolean =>
  hasCommandModifier(event) || event.shiftKey;
