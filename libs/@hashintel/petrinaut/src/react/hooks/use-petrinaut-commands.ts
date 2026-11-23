import { use } from "react";

import { ActiveNetContext } from "../document/active-net-context";
import { useCoreInstance } from "../document/use-petrinaut-instance";
import { useIsReadOnly } from "../state/use-is-read-only";
import { useHostRulesFeedback } from "./use-host-rules-feedback";
import { useReadOnlyFeedback } from "./use-read-only-feedback";

import type { PetrinautCommands } from "@hashintel/petrinaut-core";

/**
 * React-facing bundle of composite host commands (clipboard paste,
 * auto-layout, ...).
 *
 * Each command shows the read-only notice and returns a default-shaped result
 * when {@link useIsReadOnly} returns `true`, matching the behaviour of
 * {@link usePetrinautMutations}. A paste into an editor that only composes
 * says why it does nothing, where Core itself would throw. Components MUST
 * NOT reach for `usePetrinautInstance().commands` directly.
 */
export function usePetrinautCommands(): PetrinautCommands {
  const instance = useCoreInstance("usePetrinautCommands");
  const isReadOnly = useIsReadOnly();
  const notifyReadOnly = useReadOnlyFeedback();
  const { activeComponentId } = use(ActiveNetContext);
  const notifyHostRules = useHostRulesFeedback();
  const { commands } = instance;

  /** Says why the host's rules refuse a command, where Core itself would throw. */
  const refused = (name: keyof PetrinautCommands, input: unknown): boolean => {
    const refusal = instance.commandRefusal(name, input);
    if (refusal !== null) {
      notifyHostRules(refusal);
    }
    return refusal !== null;
  };

  return {
    applyClipboardPaste(input) {
      if (isReadOnly) {
        notifyReadOnly();
        return { newItemIds: [] };
      }
      const targeted = { ...input, targetComponentId: activeComponentId };
      return refused("applyClipboardPaste", targeted)
        ? { newItemIds: [] }
        : commands.applyClipboardPaste(targeted);
    },
    async applyAutoLayout() {
      if (isReadOnly) {
        notifyReadOnly();
        return { commitCount: 0 };
      }
      const targeted = { targetComponentId: activeComponentId };
      return refused("applyAutoLayout", targeted)
        ? { commitCount: 0 }
        : commands.applyAutoLayout(targeted);
    },
  };
}
