import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { useIsReadOnly } from "../state/use-is-read-only";

import type { PetrinautCommands } from "@hashintel/petrinaut-core";

/**
 * React-facing bundle of composite host commands (clipboard paste,
 * auto-layout, ...).
 *
 * Each command no-ops or returns a default-shaped result when
 * {@link useIsReadOnly} returns `true`, matching the behaviour of
 * {@link usePetrinautMutations}. Components MUST NOT reach for
 * `usePetrinautInstance().commands` directly.
 */
export function usePetrinautCommands(): PetrinautCommands {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "usePetrinautCommands must be used inside <PetrinautProvider> (or <Petrinaut>).",
    );
  }
  const isReadOnly = useIsReadOnly();
  const { commands } = instance;

  return {
    applyClipboardPaste(input) {
      if (isReadOnly) {
        return { newItemIds: [] };
      }
      return commands.applyClipboardPaste(input);
    },
    async applyAutoLayout() {
      if (isReadOnly) {
        return { commitCount: 0 };
      }
      return commands.applyAutoLayout();
    },
  };
}
