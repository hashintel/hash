import { createToaster } from "@ark-ui/react/toast";

export const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
  overlap: true,
  max: 5,
});
