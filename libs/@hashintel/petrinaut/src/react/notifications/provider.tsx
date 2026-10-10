import { useEffect, type ReactNode } from "react";

import {
  NotificationsContext,
  type AddNotificationInput,
  type NotificationsContextValue,
} from "./context";
import { NotificationsToaster, notificationsToaster } from "./toaster";

const DEFAULT_NOTIFICATION_DURATION_MS = 3000;

let nextNotificationId = 0;

export const NotificationsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const dismissNotification = (id: string) => {
    queueMicrotask(() => {
      notificationsToaster.dismiss(id);
    });
  };

  const addNotification = ({
    action,
    id: suppliedId,
    detail,
    durationMs,
    message,
    tone = "success",
  }: AddNotificationInput) => {
    const id = suppliedId ?? `notification-${nextNotificationId}`;
    nextNotificationId += 1;
    const effectiveDurationMs =
      tone === "error"
        ? Infinity
        : (durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS);

    queueMicrotask(() => {
      if (notificationsToaster.isVisible(id)) return;
      notificationsToaster.create({
        ...(action ? { action } : {}),
        description: detail,
        duration: effectiveDurationMs,
        id,
        title: message,
        // Ark renders only its own toast types; a neutral notice is its `info`.
        type: tone === "neutral" ? "info" : tone,
      });
    });

    return id;
  };

  useEffect(() => {
    return () => {
      // Removed rather than dismissed: a dismissal animates out through each
      // toast's own machine, which unmounts with this editor, so the shared
      // store would hand the toast to the next editor on the page.
      notificationsToaster.remove();
    };
  }, []);

  const value: NotificationsContextValue = {
    addNotification,
    dismissNotification,
  };

  return (
    <NotificationsContext value={value}>
      {children}
      <NotificationsToaster />
    </NotificationsContext>
  );
};
