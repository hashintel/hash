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
    detail,
    durationMs,
    message,
    tone = "success",
  }: AddNotificationInput) => {
    const id = `notification-${nextNotificationId}`;
    nextNotificationId += 1;
    const effectiveDurationMs =
      tone === "error"
        ? Infinity
        : (durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS);

    queueMicrotask(() => {
      notificationsToaster.create({
        description: detail,
        duration: effectiveDurationMs,
        id,
        title: message,
        type: tone,
      });
    });

    return id;
  };

  useEffect(() => {
    return () => {
      notificationsToaster.dismiss();
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
