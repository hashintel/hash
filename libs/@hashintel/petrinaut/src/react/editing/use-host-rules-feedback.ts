import { use } from "react";

import { NotificationsContext } from "../notifications/context";

/**
 * A function that shows why the host's rules refused an edit. Repeated
 * refusals show one notice, not a stack.
 */
export const useHostRulesFeedback = () => {
  // It calls no hook but `use`, which `infer` mode would skip.
  "use memo";
  const { addNotification } = use(NotificationsContext);

  return (refusal: string) =>
    addNotification({
      id: "host-rules",
      message: refusal,
      tone: "neutral",
      durationMs: 4500,
      layout: "singleLine",
    });
};
