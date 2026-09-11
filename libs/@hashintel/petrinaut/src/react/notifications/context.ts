import { createContext } from "react";

export type NotificationTone = "error" | "neutral" | "success";

export type AddNotificationInput = {
  id?: string;
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
