import { LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

const center = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
const loadingRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "fg.subtle",
});
const loadingText = css({ textStyle: "sm", color: "fg.subtle" });
const errorText = css({ textStyle: "sm", color: "status.error.fg.body" });

/** Centered, muted "loading…" message with a ds spinner. Size the area via `className` (e.g. `h-32`). */
export const LoadingState = ({
  message,
  className,
}: {
  message: string;
  className?: string;
}) => {
  return (
    <div className={cx(center, className)}>
      <div className={loadingRow}>
        <LoadingSpinner size="sm" />
        <p className={loadingText}>{message}</p>
      </div>
    </div>
  );
};

/** Inline error message. Pad/position via `className` (e.g. `px-6 py-4`). */
export const ErrorState = ({
  message,
  className,
}: {
  message: string;
  className?: string;
}) => {
  return <p className={cx(errorText, className)}>{message}</p>;
};
