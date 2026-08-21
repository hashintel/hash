import { useCallback, useEffect, useMemo, useState } from "react";

import { KeyboardShortcutsContext } from "./keyboard-shortcuts-context";

import type {
  KeyboardShortcut,
  SetKeyboardShortcutsFunction,
  UnsetKeyboardShortcutsFunction,
} from "./keyboard-shortcuts-context";
import type { FunctionComponent, PropsWithChildren } from "react";

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
