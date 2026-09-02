import { css } from "@hashintel/ds-helpers/css";

// Sits in the text flow ahead of the words it belongs to, so a spoken turn is
// marked where reading starts rather than by something trailing the bubble.
const chipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "[3px]",
  marginRight: "[6px]",
  padding: "[1px 6px 1px 4px]",
  borderRadius: "full",
  backgroundColor: "blue.a30",
  color: "blue.s110",
  fontSize: "[10px]",
  fontWeight: "semibold",
  letterSpacing: "[0.03em]",
  textTransform: "uppercase",
  verticalAlign: "[1px]",
  whiteSpace: "nowrap",
});

const captionStyle = css({
  display: "inline-block",
  color: "neutral.s80",
  fontSize: "[10px]",
  fontWeight: "medium",
  whiteSpace: "nowrap",
});

export const VoiceInputProvenance = ({
  presentation = "chip",
}: {
  presentation?: "caption" | "chip";
}) => (
  <span
    className={presentation === "caption" ? captionStyle : chipStyle}
    data-testid="voice-input-provenance"
  >
    {presentation === "caption" ? (
      "Submitted by voice"
    ) : (
      <>
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
        Voice
      </>
    )}
  </span>
);
