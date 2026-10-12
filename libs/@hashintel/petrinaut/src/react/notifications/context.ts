import { createContext } from "react";

export type NotificationTone = "error" | "neutral" | "success";

export type AddNotificationInput = {
  /** Names the notification: one still on screen under this id is not shown again. */
  id?: string;
  /** A button on the notification; clicking it runs `onClick` and dismisses it. */
  action?: { label: string; onClick: () => void };
  detail?: string;
  message: string;
  tone?: NotificationTone;
  durationMs?: number;
};

export type NotificationsContextValue = {
  addNotification: (notification: AddNotificationInput) => string;
  dismissNotification: (id: string) => void;
};

export const NotificationsContext = createContext<NotificationsContextValue>({
  addNotification: () => "",
  dismissNotification: () => {},
});
