/**
 * A stable speaker glyph whose slash is the only visual difference between
 * audible and muted output.
 */
export const SpeakerIcon = ({ muted = false }: { muted?: boolean }) => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 20 20"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3.5 8h3l4-3.5v11l-4-3.5h-3z"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
    <path
      d="M13 7.25a4 4 0 0 1 0 5.5M15.25 5a7 7 0 0 1 0 10"
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
