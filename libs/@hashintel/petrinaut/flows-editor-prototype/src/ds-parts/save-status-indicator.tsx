/**
 * figma-ds SaveStatusIndicator (`15975:18513`) with Flows' words (ledger L386): "Saved" and "Saving…" (after the bars
 * loader) muted, and the error in the failed red after its warning icon, with an optional retry after it. Breaks,
 * recorded: 14 px rather than the part's 16 px, so the top bar keeps one text size (one size per row); regular weight
 * rather than medium, so "Saved" stays as quiet as the top bar drew it before the part.
 */
import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

type SaveStatus = "saved" | "saving" | "error";

const rowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "sm",
  whiteSpace: "nowrap",
  transition: "[opacity 600ms ease-out]",
});

const savedStyle = css({ color: "neutral.fg.subtle" });

const savingStyle = css({ color: "neutral.fg.subtle" });

const errorStyle = css({ color: "[var(--flows-failed-text)]" });

export const SaveStatusIndicator = ({
  status,
  savedText = "Saved",
  savingText = "Saving…",
  errorText = "Couldn't save your changes",
  retry,
  errorColor,
  style,
  ...rest
}: {
  status: SaveStatus;
  savedText?: string;
  savingText?: string;
  errorText?: string;
  /** Shown after the error text. */
  retry?: React.ReactNode;
  /** Another red for the error text (a CSS colour). */
  errorColor?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    // The error's red sits on the whole row, so an inline retry after the words takes it too.
    className={cx(rowStyle, status === "error" && errorStyle)}
    style={
      status === "error" && errorColor ? { ...style, color: errorColor } : style
    }
    role={status === "error" ? "alert" : undefined}
    aria-live={status === "error" ? undefined : "polite"}
    {...rest}
  >
    {status === "saving" ? (
      <>
        <LoadingSpinner size="xs" variant="bars" />
        <span className={savingStyle}>{savingText}</span>
      </>
    ) : status === "error" ? (
      <>
        <Icon name="warning" size="sm" />
        <span>{errorText}</span>
        {retry}
      </>
    ) : (
      <span className={savedStyle}>{savedText}</span>
    )}
  </span>
);
