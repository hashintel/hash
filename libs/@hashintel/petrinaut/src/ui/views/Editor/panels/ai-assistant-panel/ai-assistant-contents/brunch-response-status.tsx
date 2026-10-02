import { LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

/**
 * A fixed-height row below the transcript that names the wait while the chat
 * has nothing new to show: before the reply starts, or while the host tab
 * hides it. It stays mounted so the layout doesn't jump.
 */
export const BrunchResponseStatus = ({
  busy,
  className,
  hostTabSelected,
  replyStarted,
  workingLabel,
}: {
  busy: boolean;
  className?: string;
  hostTabSelected: boolean;
  replyStarted: boolean;
  workingLabel?: string;
}) => {
  const label = !busy
    ? undefined
    : hostTabSelected
      ? (workingLabel ?? "Brunch is working")
      : replyStarted
        ? undefined
        : "Waiting for Brunch";

  return (
    <div
      className={cx(
        css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          height: "[28px]",
          flexShrink: 0,
          minWidth: "[0]",
          paddingX: "3",
          color: "neutral.s90",
          fontSize: "xs",
        }),
        className,
      )}
      data-testid="brunch-response-status"
    >
      {label && (
        <LoadingSpinner
          aria-hidden="true"
          size="xs"
          className={css({
            color: "blue.s90",
            flexShrink: 0,
            "@media (prefers-reduced-motion: reduce)": {
              animation: "[none !important]",
            },
          })}
        />
      )}
      <span role="status" className={css({ minWidth: "[0]", truncate: true })}>
        {label}
      </span>
    </div>
  );
};
