const sharedIconProps = {
  "aria-hidden": true,
  fill: "none",
  height: "16",
  viewBox: "0 0 20 20",
  width: "16",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

/** Uses the same line weight and canvas as the microphone and speaker icons. */
export const StopIcon = () => (
  <svg {...sharedIconProps}>
    <rect
      height="10"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.6"
      width="10"
      x="5"
      y="5"
    />
  </svg>
);

/** Uses the same line weight and canvas as the other Voice action icons. */
export const EndIcon = () => (
  <svg {...sharedIconProps}>
    <path
      d="M5 5l10 10M15 5L5 15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  </svg>
);
