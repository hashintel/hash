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
  function dismissNotification(id: string) {
    queueMicrotask(() => {
      notificationsToaster.dismiss(id);
    });
  }

  function addNotification({
    durationMs,
    message,
    tone = "success",
  }: AddNotificationInput) {
    const id = `notification-${nextNotificationId++}`;
    const effectiveDurationMs = durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS;

    queueMicrotask(() => {
      notificationsToaster.create({
        duration: effectiveDurationMs,
        id,
        title: message,
        type: tone,
      });
    });

    return id;
  }

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
