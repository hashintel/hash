const sharedIconProps = {
  "aria-hidden": true,
  fill: "none",
  height: "16",
  viewBox: "0 0 20 20",
  width: "16",
  xmlns: "http://www.w3.org/2000/svg",
} as const;

/** Compact outlined stop mark from the Voice dock design. */
export const StopIcon = () => (
  <svg {...sharedIconProps} viewBox="0 0 24 24">
    <rect
      height="11"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      width="11"
      x="6.5"
      y="6.5"
    />
  </svg>
);

/** Hang-up handset from the Voice dock design, distinct from closing the panel. */
export const EndIcon = () => (
  <svg {...sharedIconProps} viewBox="0 0 24 24">
    <path
      d="M3.2 14.2a12.6 12.6 0 0 1 17.6 0l-1.7 2.2a1 1 0 0 1-1.3.3l-2.4-1.3a1 1 0 0 1-.5-.9v-1.9a10.3 10.3 0 0 0-5.8 0v1.9a1 1 0 0 1-.5.9l-2.4 1.3a1 1 0 0 1-1.3-.3z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  </svg>
);
