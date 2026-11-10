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
  /**
   * Hands the notification, without its `action`, to the next editor on the
   * page when the editor that raised it unmounts. That editor removes it like
   * any other when it unmounts in turn. Use it for a notification about a
   * document the host opens in a new editor, as an import does.
   */
  outlivesEditor?: boolean;
};

export type NotificationsContextValue = {
  addNotification: (notification: AddNotificationInput) => string;
  dismissNotification: (id: string) => void;
};

export const NotificationsContext = createContext<NotificationsContextValue>({
  addNotification: () => "",
  dismissNotification: () => {},
});
