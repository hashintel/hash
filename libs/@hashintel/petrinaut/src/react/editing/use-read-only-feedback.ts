import { use } from "react";

import { SDCPNContext } from "../document/sdcpn-context";
import { ReadOnlyActionContext } from "../host/read-only-action-context";
import { NotificationsContext } from "../notifications/context";
import { useReadOnlyReason } from "./use-read-only-reason";

/**
 * A function that tells the user why an edit was just blocked, or does nothing
 * when the net is writable. Repeated attempts show one notice, not a stack.
 */
export const useReadOnlyFeedback = () => {
  const reason = useReadOnlyReason();
  const readOnlyAction = use(ReadOnlyActionContext);
  const { petriNetId } = use(SDCPNContext);
  const { addNotification } = use(NotificationsContext);

  return () => {
    if (reason === null) return;
    const message =
      reason.kind === "host-readonly"
        ? "This document is read-only."
        : reason.kind === "simulation-active"
          ? "Reset the simulation to edit this net."
          : "Switch to Edit to change this net.";
    addNotification({
      id: `read-only:${petriNetId}:${reason.kind}`,
      message,
      tone: "neutral",
      durationMs: 4500,
      action: reason.kind === "host-readonly" ? readOnlyAction : undefined,
    });
  };
};
