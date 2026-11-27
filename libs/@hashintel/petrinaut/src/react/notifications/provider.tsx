/**
 * @layerRoot react.notifications
 * @role Shows a short notice from any provider or component, once per id
 */

import { useState, type ReactNode } from "react";

import { Toast, Toaster } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  NotificationsContext,
  type AddNotificationInput,
  type NotificationsContextValue,
} from "./context";
import { CopyDetailsButton } from "./copy-details-button";

const DEFAULT_NOTIFICATION_DURATION_MS = 3000;

const titleRowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "1",
});

const titleStyle = css({
  flex: "1",
  minWidth: "0",
});

// Room for a typical two-line detail without rewrapping it.
const detailToastStyle = css({
  "--toast-max-width": "[520px]",
});

const detailStyle = css({
  maxHeight: "[240px]",
  overflow: "auto",
  whiteSpace: "pre-wrap",
});

let nextNotificationId = 0;

type ShownNotification = AddNotificationInput & { id: string };

export const NotificationsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [notifications, setNotifications] = useState<ShownNotification[]>([]);

  const removeNotification = (id: string) => {
    setNotifications((previous) =>
      previous.filter((notification) => notification.id !== id),
    );
  };

  const addNotification = (input: AddNotificationInput) => {
    const id = input.id ?? `notification-${nextNotificationId}`;
    nextNotificationId += 1;
    setNotifications((previous) =>
      previous.some((notification) => notification.id === id)
        ? previous
        : [...previous, { ...input, id }],
    );
    return id;
  };

  const value: NotificationsContextValue = {
    addNotification,
  };

  return (
    <Toaster label="Notifications">
      <NotificationsContext value={value}>
        {children}
        {notifications.map(
          ({
            id,
            action,
            detail,
            durationMs,
            layout,
            message,
            tone = "success",
          }) => {
            // An error stays until dismissed, and detail is there to be read,
            // so both offer a way out; a plain message clears itself.
            const dismissible = detail !== undefined || tone === "error";
            return (
              <Toast
                key={id}
                id={id}
                tone={tone}
                variant="solid"
                layout={layout}
                className={detail ? detailToastStyle : undefined}
                duration={
                  tone === "error"
                    ? Infinity
                    : (durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS)
                }
                shouldCloseOn={dismissible ? "closeButton" : "none"}
                onStatusChange={({ status }) => {
                  if (status === "exit") {
                    removeNotification(id);
                  }
                }}
              >
                <div className={titleRowStyle}>
                  <Toast.Title
                    className={titleStyle}
                    title={message}
                    icon={tone !== "neutral"}
                  />
                  {detail && <CopyDetailsButton detail={detail} />}
                </div>
                {detail && (
                  <Toast.Body className={detailStyle}>{detail}</Toast.Body>
                )}
                {action && (
                  <Toast.Actions
                    actions={
                      <Toast.Action closeToast onClick={action.onClick}>
                        {action.label}
                      </Toast.Action>
                    }
                  />
                )}
              </Toast>
            );
          },
        )}
      </NotificationsContext>
    </Toaster>
  );
};
