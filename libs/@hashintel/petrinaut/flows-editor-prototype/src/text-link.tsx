/**
 * A link to another screen (5 Nov, ledger L392; 11 Nov convergence A19): neutral text, underlined on hover. The ↗ shows
 * only when the link leaves Flows (`leaves`). The figma-ds has no inline text link, only the `neutral/fg/link` token.
 */
import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const linkStyle = css({
  all: "unset",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.body",
  whiteSpace: "nowrap",
  textDecorationColor: "neutral.bd.solid",
  textUnderlineOffset: "[3px]",
  _hover: { color: "neutral.fg.heading", textDecorationLine: "underline" },
  _focusVisible: { textDecorationLine: "underline", outline: "none" },
  "& svg": { color: "neutral.fg.subtle" },
});

export const TextLink = ({
  children,
  onClick,
  leaves = false,
  tooltip,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** The link opens something outside Flows: a ↗ after the words. */
  leaves?: boolean;
  tooltip?: string;
}) => {
  const link = (
    <button type="button" className={linkStyle} onClick={onClick}>
      {children}
      {leaves ? <Icon name="arrowUpRight" size="sm" /> : null}
    </button>
  );
  return tooltip ? (
    <Tooltip content={tooltip} position="top">
      {link}
    </Tooltip>
  ) : (
    link
  );
};
