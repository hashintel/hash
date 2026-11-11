/**
 * figma-ds `_File` row (`21337:29335`, size lg): a white card with a faint border, 8 px radius and 4.5 px padding; a
 * 28 px preview square; the name (14 medium) with its size (12 subtle) on one line. Flows' outputs are read-only, so
 * there is no ×, and the whole card opens the file.
 *
 * Gap, recorded: the figma-ds row has one line. Flows needs a second line for what the file says (a certificate's
 * issuer and expiry, an email's subject), so `detail` adds it under the name in the same 12 px subtle text.
 */
import { css, cx } from "@hashintel/ds-helpers/css";

const cardStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  padding: "[4.5px]",
  paddingRight: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
  textAlign: "left",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: {
    outline: "none",
    boxShadow: "[0 0 0 2px var(--colors-neutral-a20)]",
  },
});

const previewStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  flexShrink: 0,
  width: "[28px]",
  height: "[28px]",
  overflow: "hidden",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[4px]",
  backgroundColor: "neutral.bg.subtle.hover",
  color: "neutral.fg.subtle",
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flex: "1",
  minWidth: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "[4.5px]",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});

const nameStyle = css({
  textStyle: "sm",
  lineHeight: "[14px]",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: "[0]",
});

const smallStyle = css({
  textStyle: "xs",
  lineHeight: "[12px]",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
  flexShrink: 0,
});

const detailStyle = css({
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const FileRow = ({
  preview,
  name,
  size,
  detail,
  aside,
  onClick,
  className,
  ...rest
}: {
  /** What fills the 28 px square: a cropped page, or a 12 px file icon. */
  preview: React.ReactNode;
  name: React.ReactNode;
  size?: React.ReactNode;
  /** The recorded gap: a second line under the name. */
  detail?: React.ReactNode;
  /** Something at the row's end, e.g. the type in a list of several types. */
  aside?: React.ReactNode;
  onClick: () => void;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) => (
  <button
    type="button"
    className={cx(cardStyle, className)}
    onClick={onClick}
    {...rest}
  >
    <span className={previewStyle}>{preview}</span>
    <span className={textStyle}>
      <span className={headerStyle}>
        <span className={nameStyle}>{name}</span>
        {size ? <span className={smallStyle}>{size}</span> : null}
      </span>
      {detail ? <span className={detailStyle}>{detail}</span> : null}
    </span>
    {aside ? <span className={smallStyle}>{aside}</span> : null}
  </button>
);
