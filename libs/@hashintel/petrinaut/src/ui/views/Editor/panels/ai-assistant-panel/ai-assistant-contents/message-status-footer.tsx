import { css, cva } from "@hashintel/ds-helpers/css";

import { StreamingEllipsis } from "./shared/streaming-ellipsis";

const STALL_MILD_THRESHOLD_MS = 90_000;
const STALL_SEVERE_THRESHOLD_MS = 240_000;

const phaseStatusStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "1",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[1.4]",
});

const phaseStatusLabelStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const stallWarningStyle = cva({
  base: {
    color: "neutral.s70",
    fontWeight: "normal",
  },
  variants: {
    severity: {
      mild: {
        color: "neutral.s70",
      },
      severe: {
        color: "red.s90",
        fontWeight: "medium",
      },
    },
  },
});

export const MessageStatusFooter = ({
  phaseLabel,
  stallMs,
}: {
  phaseLabel?: string;
  stallMs: number;
}) => {
  const severity =
    stallMs >= STALL_SEVERE_THRESHOLD_MS
      ? "severe"
      : stallMs >= STALL_MILD_THRESHOLD_MS
        ? "mild"
        : null;
  const stallMessage =
    severity === "severe"
      ? "the model may have stalled — you can stop and retry"
      : severity === "mild"
        ? "still working…"
        : null;

  if (!phaseLabel && !stallMessage) {
    return null;
  }

  return (
    <div
      className={phaseStatusStyle}
      data-testid="message-status-footer"
      role="status"
      aria-live="polite"
    >
      {phaseLabel && (
        <span className={phaseStatusLabelStyle}>
          {phaseLabel}
          <StreamingEllipsis />
        </span>
      )}
      {stallMessage && severity && (
        <span className={stallWarningStyle({ severity })}>
          ({stallMessage})
        </span>
      )}
    </div>
  );
};
