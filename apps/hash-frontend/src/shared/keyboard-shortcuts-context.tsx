import type { FunctionComponent, PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type KeyboardShortcut = {
  keys: string[];
  callback: (event: KeyboardEvent) => void;
};

type SetKeyboardShortcutsFunction = (shortcuts: KeyboardShortcut[]) => void;

type UnsetKeyboardShortcutsFunction = (
  shortcutsToUnset: { keys: string[] }[],
) => void;

type KeyboardShortcutsContextValue = {
  setKeyboardShortcuts: SetKeyboardShortcutsFunction;
  unsetKeyboardShortcuts: UnsetKeyboardShortcutsFunction;
};

export const KeyboardShortcutsContext =
  createContext<null | KeyboardShortcutsContextValue>(null);

const modKeyToKeyboardEventProperty: Record<string, keyof KeyboardEvent> = {
  Alt: "altKey",
  Meta: "metaKey",
  Control: "ctrlKey",
  Shift: "shiftKey",
};

/**
 * We detect which keys are pressed based on a single KeyboardEvent.
 *
 * See limitations described on {@link useSetKeyboardShortcuts}
 */
const areAllKeysPressed = (event: KeyboardEvent, keys: string[]) => {
  for (const key of keys) {
    const modifierProperty = modKeyToKeyboardEventProperty[key];

    if (event.key !== key && (!modifierProperty || !event[modifierProperty])) {
      return false;
    }
  }

  return true;
};

export const KeyboardShortcutsContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const [keyboardShortcutsState, setKeyboardShortcutsState] = useState<
    KeyboardShortcut[]
  >([]);

  const setKeyboardShortcuts: SetKeyboardShortcutsFunction = useCallback(
    (shortcutsToRegister) => {
      setKeyboardShortcutsState((currentShortcuts) => {
        /**
         * This approach means that if Shortcut A's key combination is overridden in some context by Shortcut B,
         * and then Shortcut B is unset, Shortcut A will no longer be in the list of shortcuts either.
         * If we ever need to introduce shortcuts with duplicate keys we should change this, and figure out
         * a way of setting the priority of shortcuts with duplicate keys.
         * Similarly, {@link unsetKeyboardShortcuts} would need updating to not wipe out all shortcuts for the given keys.
         */
        const currentShortcutsWithoutDuplicates = currentShortcuts.filter(
          (existingShortcut) =>
            !shortcutsToRegister.some(
              (newShortcut) =>
                newShortcut.keys.length === existingShortcut.keys.length &&
                existingShortcut.keys.every((key) =>
                  newShortcut.keys.includes(key),
                ),
            ),
        );

        return [...currentShortcutsWithoutDuplicates, ...shortcutsToRegister];
      });
    },
    [],
  );

  const unsetKeyboardShortcuts: UnsetKeyboardShortcutsFunction = useCallback(
    (shortcutsKeysToRemove) => {
      setKeyboardShortcutsState((currentShortcuts) =>
        currentShortcuts.filter(
          (currentShortcut) =>
            !shortcutsKeysToRemove.some(
              ({ keys: keysToRemove }) =>
                currentShortcut.keys.length !== keysToRemove.length ||
                !currentShortcut.keys.every((key) =>
                  keysToRemove.includes(key),
                ),
            ),
        ),
      );
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = keyboardShortcutsState.find(({ keys }) =>
        areAllKeysPressed(event, keys),
      );

      if (shortcut) {
        event.preventDefault();
        shortcut.callback(event);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [keyboardShortcutsState]);

  const value = useMemo(
    () => ({ setKeyboardShortcuts, unsetKeyboardShortcuts }),
    [setKeyboardShortcuts, unsetKeyboardShortcuts],
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
};

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
