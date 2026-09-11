import { use } from "react";

import { NotificationsContext } from "../notifications/context";
import { ReadOnlyActionContext } from "../state/read-only-action-context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useReadOnlyReason } from "../state/use-read-only-reason";

export const useReadOnlyFeedback = () => {
  const reason = useReadOnlyReason();
  const action = use(ReadOnlyActionContext);
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
      action: reason.kind === "host-readonly" ? action : undefined,
    });
  };
};
