import { createToaster } from "@ark-ui/react/toast";

export const notificationsToaster = createToaster({
  gap: 8,
  offsets: "16px",
  placement: "bottom-end",
  removeDelay: 200,
});
