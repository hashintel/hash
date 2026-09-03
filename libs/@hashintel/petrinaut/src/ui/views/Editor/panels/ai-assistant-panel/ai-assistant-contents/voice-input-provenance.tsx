import { css } from "@hashintel/ds-helpers/css";

// Sits in the text flow ahead of the words it belongs to, so a spoken turn is
// marked where reading starts rather than by something trailing the bubble.
const iconStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "4",
  height: "4",
  flexShrink: "0",
  marginRight: "[6px]",
  borderRadius: "full",
  backgroundColor: "blue.a30",
  color: "blue.s110",
  verticalAlign: "middle",
});

export const VoiceInputProvenance = () => (
  <span
    aria-label="Submitted by voice"
    className={iconStyle}
    data-testid="voice-input-provenance"
    role="img"
  >
    <svg
      aria-hidden="true"
      fill="none"
      height="9"
      viewBox="0 0 20 20"
      width="9"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 8.5v3M6.5 5.5v9M10 3v14M13.5 6v8M17 8.5v3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  </span>
);
