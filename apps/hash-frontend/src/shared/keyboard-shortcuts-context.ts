import { createContext, useContext } from "react";

export type KeyboardShortcut = {
  keys: string[];
  callback: (event: KeyboardEvent) => void;
};

export type SetKeyboardShortcutsFunction = (
  shortcuts: KeyboardShortcut[],
) => void;

export type UnsetKeyboardShortcutsFunction = (
  shortcutsToUnset: { keys: string[] }[],
) => void;

type KeyboardShortcutsContextValue = {
  setKeyboardShortcuts: SetKeyboardShortcutsFunction;
  unsetKeyboardShortcuts: UnsetKeyboardShortcutsFunction;
};

export const KeyboardShortcutsContext =
  createContext<null | KeyboardShortcutsContextValue>(null);

/**
 * Set a keyboard shortcut that will trigger the given callback when the given keys are pressed.
 *
 * This is limited by the information available on a single KeyboardEvent, and therefore
 * - CANNOT distinguish between left/right modifier keys. Pass 'Meta', 'Control', 'Alt', 'Shift', NOT 'MetaLeft' etc
 * - CANNOT handle shortcuts which involve multiple non-modifier keys being pressed (e.g. K + P, W + 1, I + ;)
 *
 * An alternative approach would be to maintain a manual mapping of which keys have been held down or released,
 * which could distinguish between modifier keys, but OS shortcuts / actions can take window focus without triggering
 * 'keyup' or 'blur' event listeners, and therefore there are situations in which the manual keyup handler will not fire,
 * and any manual map may still record a key as being pressed when it is not.
 *
 * If it is ever important that we handle shortcuts which cannot be detected from a single KeyboardEvent, we should:
 * - manually maintain a mapping of which keys are currently pressed based on keydown and keyup handlers
 * - add an event listener for `"blur"` on `window` to clear the map if the window loses focus
 *   NOTE: this does not work for all events that may trigger the browser losing focus, e.g. MacOS screenshot shortcut
 * - add an interval to clear the key map if the window is not focused to handle situations not covered by the 'blur' listener
 * - know that this will not be able to detect key combinations if a key is pressed and held while the window is not focused.
 *
 * The 'single KeyboardEvent' approach is taken for now because it is simpler and more reliable, and there is no current
 * use case for the different key combinations that the more complex and less reliable approach enables.
 */
export const useSetKeyboardShortcuts = (): SetKeyboardShortcutsFunction => {
  const context = useContext(KeyboardShortcutsContext);

  if (!context) {
    throw new Error(
      "useSetKeyboardShortcut must be used within a KeyboardShortcutsContextProvider",
    );
  }

  return context.setKeyboardShortcuts;
};

export const useUnsetKeyboardShortcuts = (): UnsetKeyboardShortcutsFunction => {
  const context = useContext(KeyboardShortcutsContext);

  if (!context) {
    throw new Error(
      "useUnsetKeyboardShortcut must be used within a KeyboardShortcutsContextProvider",
    );
  }

  return context.unsetKeyboardShortcuts;
};
