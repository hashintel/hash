import { useEffect, useRef, type ReactNode } from "react";

import {
  NotificationsContext,
  type AddNotificationInput,
  type NotificationsContextValue,
} from "./context";
import { NotificationsToaster, notificationsToaster } from "./toaster";

const DEFAULT_NOTIFICATION_DURATION_MS = 3000;

let nextNotificationId = 0;

type Toast = Parameters<typeof notificationsToaster.create>[0];

/**
 * The toast of each notification that the editor on screen hands to the next
 * one when it unmounts, by id.
 */
const outlivingEditor = new Map<string, Toast>();

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
    outlivesEditor = false,
    tone = "success",
  }: AddNotificationInput) => {
    const id = suppliedId ?? `notification-${nextNotificationId}`;
    nextNotificationId += 1;
    const effectiveDurationMs =
      tone === "error"
        ? Infinity
        : (durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS);

    const toast: Toast = {
      action,
      description: detail,
      duration: effectiveDurationMs,
      id,
      title: message,
      // zag's toast store throws on a type outside its own; a neutral notice
      // is its `info`.
      type: tone === "neutral" ? "info" : tone,
    };
    if (outlivesEditor) {
      // A toast that is closing, by its button or its timer, stays in the
      // store until its exit animation ends.
      toast.onStatusChange = ({ status }) => {
        if (status === "dismissing") {
          outlivingEditor.delete(id);
        }
      };
      outlivingEditor.set(id, toast);
    }

    queueMicrotask(() => {
      if (notificationsToaster.isVisible(id)) return;
      notificationsToaster.create(toast);
    });

    return id;
  };

  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // In a microtask, like every other call into the store: its subscribers
      // set React state, which React refuses while it unmounts this editor.
      queueMicrotask(() => {
        // StrictMode runs this cleanup once on an editor that stays mounted,
        // which would discard a notification handed to that editor.
        if (mountedRef.current) return;
        const handedOver = [...outlivingEditor.values()].filter(
          ({ id }) => id !== undefined && notificationsToaster.isVisible(id),
        );
        outlivingEditor.clear();
        // Removed rather than dismissed: a dismissal animates out through
        // each toast's own machine, which unmounts with this editor, so the
        // shared store would hand the toast to the next editor on the page.
        notificationsToaster.remove();
        // An action would run in the editor that has unmounted.
        for (const toast of handedOver) {
          notificationsToaster.create({ ...toast, action: undefined });
        }
      });
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
