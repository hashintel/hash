import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { NotificationsContext } from "../notifications/context";
import { ActiveNetContext } from "../state/active-net-context";
import { useIsReadOnly } from "../state/use-is-read-only";
import { useReadOnlyFeedback } from "./use-read-only-feedback";

import type { PetrinautCommands } from "@hashintel/petrinaut-core";

/**
 * React-facing bundle of composite host commands (clipboard paste,
 * auto-layout, ...).
 *
 * Each command shows the read-only notice and returns a default-shaped result
 * when {@link useIsReadOnly} returns `true`, matching the behaviour of
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
  const notifyReadOnly = useReadOnlyFeedback();
  const { activeSubnetId } = use(ActiveNetContext);
  const { addNotification } = use(NotificationsContext);
  const { commands } = instance;

  /** Says why the host's rules refuse a command, where Core itself would throw. */
  const refused = (name: keyof PetrinautCommands, input: unknown): boolean => {
    const refusal = instance.commandRefusal(name, input);
    if (refusal !== null) {
      addNotification({
        id: "host-rules",
        message: refusal,
        tone: "neutral",
        durationMs: 4500,
      });
    }
    return refusal !== null;
  };

  return {
    applyClipboardPaste(input) {
      if (isReadOnly) {
        notifyReadOnly();
        return { newItemIds: [] };
      }
      const targeted = { ...input, targetSubnetId: activeSubnetId };
      return refused("applyClipboardPaste", targeted)
        ? { newItemIds: [] }
        : commands.applyClipboardPaste(targeted);
    },
    async applyAutoLayout() {
      if (isReadOnly) {
        notifyReadOnly();
        return { commitCount: 0 };
      }
      const targeted = { targetSubnetId: activeSubnetId };
      return refused("applyAutoLayout", targeted)
        ? { commitCount: 0 }
        : commands.applyAutoLayout(targeted);
    },
  };
}
