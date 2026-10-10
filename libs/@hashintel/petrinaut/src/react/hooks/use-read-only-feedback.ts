import { use } from "react";

import { NetManagementContext } from "../net-management-context";
import { NotificationsContext } from "../notifications/context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useReadOnlyReason } from "../state/use-read-only-reason";

/**
 * A function that tells the user why an edit was just blocked, or does nothing
 * when the net is writable. Repeated attempts show one notice, not a stack.
 */
export const useReadOnlyFeedback = () => {
  const reason = useReadOnlyReason();
  const { readOnlyAction } = use(NetManagementContext);
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
