import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  NotificationsContext,
  type AddNotificationInput,
  type NotificationsContextValue,
} from "./context";
import { NotificationsToaster, type ToastNotification } from "./toaster";

const DEFAULT_NOTIFICATION_DURATION_MS = 3000;
const NOTIFICATION_FADE_OUT_MS = 200;

export const NotificationsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const nextNotificationIdRef = useRef(0);
  const timeoutsRef = useRef(
    new Map<number, ReturnType<typeof setTimeout>[]>(),
  );

  function clearNotificationTimeouts(id: number) {
    const timeouts = timeoutsRef.current.get(id);
    if (!timeouts) {
      return;
    }

    for (const timeout of timeouts) {
      clearTimeout(timeout);
    }
    timeoutsRef.current.delete(id);
  }

  function removeNotification(id: number) {
    clearNotificationTimeouts(id);
    setNotifications((prev) =>
      prev.filter((notification) => notification.id !== id),
    );
  }

  function dismissNotification(id: number) {
    clearNotificationTimeouts(id);
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === id
          ? { ...notification, exiting: true }
          : notification,
      ),
    );

    const removeTimeout = setTimeout(() => {
      removeNotification(id);
    }, NOTIFICATION_FADE_OUT_MS);
    timeoutsRef.current.set(id, [removeTimeout]);
  }

  function addNotification({
    durationMs,
    message,
    tone = "success",
  }: AddNotificationInput) {
    const id = nextNotificationIdRef.current++;
    const effectiveDurationMs = durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS;

    setNotifications((prev) => [
      ...prev,
      { id, message, tone, exiting: false },
    ]);

    const exitTimeout = setTimeout(
      () => {
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === id
              ? { ...notification, exiting: true }
              : notification,
          ),
        );
      },
      Math.max(0, effectiveDurationMs - NOTIFICATION_FADE_OUT_MS),
    );

    const removeTimeout = setTimeout(() => {
      removeNotification(id);
    }, effectiveDurationMs);

    timeoutsRef.current.set(id, [exitTimeout, removeTimeout]);

    return id;
  }

  useEffect(() => {
    const timeoutsByNotification = timeoutsRef.current;

    return () => {
      for (const timeouts of timeoutsByNotification.values()) {
        for (const timeout of timeouts) {
          clearTimeout(timeout);
        }
      }
      timeoutsByNotification.clear();
    };
  }, []);

  const value: NotificationsContextValue = {
    addNotification,
    dismissNotification,
  };

  return (
    <NotificationsContext value={value}>
      {children}
      <NotificationsToaster notifications={notifications} />
    </NotificationsContext>
  );
};
