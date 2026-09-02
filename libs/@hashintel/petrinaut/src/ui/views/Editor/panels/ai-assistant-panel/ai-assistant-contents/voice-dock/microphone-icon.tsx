/**
 * The shared icon set has no microphone, and the dock needs the muted variant
 * to be the same drawing with a stroke through it — anything else reads as a
 * different control rather than the same one turned off.
 */
export const MicrophoneIcon = ({ muted = false }: { muted?: boolean }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 20 20"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      height="9.5"
      rx="2.75"
      stroke="currentColor"
      strokeWidth="1.6"
      width="5.5"
      x="7.25"
      y="2.25"
    />
    <path
      d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
    {muted && (
      <path
        d="M3.5 3.5l13 13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    )}
  </svg>
);
