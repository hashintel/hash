import { css, cx } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import {
  NotificationsContext,
  type NotificationsContextValue,
  type NotifyOptions,
} from "./notifications-context";

const DEFAULT_DURATION = 3000;

interface Notification {
  id: number;
  message: string;
  exiting: boolean;
}

const containerStyle = css({
  position: "absolute",
  top: "[50%]",
  left: "[50%]",
  transform: "[translate(-50%, -50%)]",
  zIndex: "[10000]",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "[8px]",
  pointerEvents: "none",
});

const animationWrapperStyle = css({
  animation: "fadeIn 0.2s ease-out",
  pointerEvents: "auto",
});

const exitingWrapperStyle = css({
  animation: "fadeOut 0.2s ease-in forwards",
});

const notificationStyle = css({
  backgroundColor: "[rgba(255, 255, 255, 0.8)]",
  color: "core.neutral.black",
  fontFamily: "[Inter, sans-serif]",
  fontSize: "[14px]",
  boxShadow: "[0 6px 12px rgba(0, 0, 0, 0.1)]",
  padding: "[20px 40px]",
  maxWidth: "[600px]",
  textAlign: "center",
  userSelect: "none",
});

interface NotificationsProviderProps {
  children: ReactNode;
}

export const NotificationsProvider: React.FC<NotificationsProviderProps> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextIdRef = useRef(0);

  const notify = useCallback((options: NotifyOptions) => {
    const id = nextIdRef.current++;
    const duration = options.duration ?? DEFAULT_DURATION;

    setNotifications((prev) => [
      ...prev,
      { id, message: options.message, exiting: false },
    ]);

    // Start exit animation before removing
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === id ? { ...notif, exiting: true } : notif,
        ),
      );
    }, duration - 200);

    // Remove after exit animation completes
    setTimeout(() => {
      setNotifications((prev) => prev.filter((notif) => notif.id !== id));
    }, duration);
  }, []);

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({ notify }),
    [notify],
  );

  return (
    <NotificationsContext.Provider value={contextValue}>
      {children}
      {notifications.length > 0 && (
        <div className={containerStyle}>
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cx(
                animationWrapperStyle,
                notification.exiting && exitingWrapperStyle,
              )}
            >
              <refractive.div
                refraction={{ radius: 31, blur: 3, bezelWidth: 20 }}
                className={notificationStyle}
              >
                {notification.message}
              </refractive.div>
            </div>
          ))}
        </div>
      )}
    </NotificationsContext.Provider>
  );
};
