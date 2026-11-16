import { use } from "react";

import { NotificationsContext } from "../notifications/context";

/**
 * A function that shows why the host's rules refused an edit. Repeated
 * refusals show one notice, not a stack.
 */
export const useHostRulesFeedback = () => {
  const { addNotification } = use(NotificationsContext);

  return (refusal: string) =>
    addNotification({
      id: "host-rules",
      message: refusal,
      tone: "neutral",
      durationMs: 4500,
    });
};
