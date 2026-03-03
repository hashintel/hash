import { createContext, use } from "react";

export interface NotifyOptions {
  message: string;
  duration?: number;
}

export interface NotificationsContextValue {
  notify: (options: NotifyOptions) => void;
}

export const NotificationsContext =
  createContext<NotificationsContextValue | null>(null);

export const useNotifications = (): NotificationsContextValue => {
  const context = use(NotificationsContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationsProvider",
    );
  }

  return context;
};
