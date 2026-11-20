import { StaticHashIcon } from "@hashintel/ds-icons/static";
const sharedIconProps = {
  "aria-hidden": true,
  fill: "none",
  height: "16",
  width: "16",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

/** Compact outlined stop mark from the Voice dock design. */
export const StopIcon = () => (
  <StaticHashIcon {...sharedIconProps} name="stop" />
);

/** Hang-up handset from the Voice dock design, distinct from closing the panel. */
export const EndIcon = () => (
  <StaticHashIcon {...sharedIconProps} name="phoneOff" />
);
