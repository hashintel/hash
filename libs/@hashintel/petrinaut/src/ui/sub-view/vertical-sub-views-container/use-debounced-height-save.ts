import { useRef } from "react";

import type { UserSettingsActions } from "../../../react/state/user-settings-context";

/**
 * Saves a section's height once its resize has been still for 300 ms, so a
 * drag writes the settings once and not on every frame.
 *
 * The timers live in a hook because a function that writes a ref and is
 * created in the container's `map` keeps the compiler from caching the list.
 */
export const useDebouncedHeightSave = (
  name: string,
  updateSubViewSection: UserSettingsActions["updateSubViewSection"],
): ((id: string, height: number) => void) => {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  return (id, height) => {
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      updateSubViewSection(name, id, { height });
    }, 300);
  };
};
