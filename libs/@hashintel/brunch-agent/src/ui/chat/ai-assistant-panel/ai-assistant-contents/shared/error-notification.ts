import type { AddNotificationInput } from "@hashintel/petrinaut/ui/plugin";

export const errorNotification = (
  message: string,
  detail?: string,
): AddNotificationInput => ({ detail, message, tone: "error" });
