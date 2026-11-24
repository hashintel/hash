import type { IconName } from "../components/Icon/icon";
import type { Tone } from "./form-shared";

/** The design-system icon each tone defaults to, shown when an `icon` prop is `true`. */
export const defaultToneIcon: Record<Tone, IconName> = {
  neutral: "info",
  brand: "info",
  warning: "warning",
  error: "diamondExclamation",
  success: "circleCheck",
};
