import { createContext } from "react";

export type NotificationTone = "error" | "neutral" | "success";

export type AddNotificationInput = {
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
