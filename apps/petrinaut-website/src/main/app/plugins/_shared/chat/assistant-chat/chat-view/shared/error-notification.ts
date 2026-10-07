import type { AddNotificationInput } from "../../../../../../../react/notifications/context";

export const errorNotification = (
  message: string,
  detail?: string,
): AddNotificationInput => ({ detail, message, tone: "error" });
