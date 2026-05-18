import { css, cx } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import type { NotificationTone } from "./context";

export type ToastNotification = {
  id: number;
  message: string;
  tone: NotificationTone;
  exiting: boolean;
};

const containerStyle = css({
  position: "absolute",
  top: "[40px]",
  left: "[50%]",
  transform: "[translateX(-50%)]",
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
  fontFamily: "[Inter, sans-serif]",
  fontSize: "[15px]",
  boxShadow: "[0 6px 12px rgba(0, 0, 0, 0.1)]",
  padding: "[20px 40px]",
  maxWidth: "[600px]",
  textAlign: "center",
  userSelect: "none",
});

const successNotificationStyle = css({
  backgroundColor: "[rgba(34, 197, 94, 0.1)]",
  color: "[#16a34a]",
});

const errorNotificationStyle = css({
  backgroundColor: "[rgba(239, 68, 68, 0.1)]",
  color: "[#dc2626]",
});

const neutralNotificationStyle = css({
  backgroundColor: "neutral.s20",
  color: "neutral.s120",
});

const getToneStyle = (tone: NotificationTone) => {
  switch (tone) {
    case "error":
      return errorNotificationStyle;
    case "neutral":
      return neutralNotificationStyle;
    case "success":
      return successNotificationStyle;
  }
};

export const NotificationsToaster = ({
  notifications,
}: {
  notifications: ToastNotification[];
}) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
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
            className={cx(notificationStyle, getToneStyle(notification.tone))}
          >
            {notification.message}
          </refractive.div>
        </div>
      ))}
    </div>
  );
};
