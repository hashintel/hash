import { css, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { TbX } from "react-icons/tb";

/**
 * Shared visual primitives used by Dialog and Drawer.
 *
 * Both share the same inner structure: Outer → Card (+ close) → Header / Body,
 * plus an optional Footer in the outer frame. Only the positioning and
 * animation layer differs between them.
 */

// -- Outer shell ---------------------------------------------------------------

export const outerStyle = css({
  backgroundColor: "neutral.s10",
  borderRadius: "2xl",
  padding: "1",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  overflow: "clip",
  userSelect: "none",
  boxShadow:
    "[0px 0px 1px 0px rgba(0,0,0,0.02), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 6px 6px -3px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.02)]",
});

// -- Card (inner white container) ----------------------------------------------

const cardStyle = css({
  position: "relative",
  backgroundColor: "neutral.s00",
  borderRadius: "xl",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.08), 0px 12px 32px 0px rgba(0,0,0,0.02)]",
  overflow: "clip",
  display: "flex",
  flexDirection: "column",
  width: "full",
  zIndex: "[2]",
  flex: "[1 1 auto]",
  minHeight: "[0]",
});

export const closeButtonStyle = css({
  position: "absolute",
  top: "2",
  right: "2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[30px]",
  height: "[30px]",
  fontSize: "base",
  color: "neutral.s100",
  backgroundColor: "[transparent]",
  border: "[none]",
  borderRadius: "lg",
  cursor: "pointer",
  zIndex: "[3]",
  _hover: {
    backgroundColor: "neutral.bg.min.hover",
  },
});

export const Card = ({
  children,
  closeButton,
}: {
  children: ReactNode;
  closeButton?: ReactNode;
}) => (
  <div className={cardStyle}>
    {children}
    {closeButton ?? (
      <button type="button" className={closeButtonStyle} aria-label="Close">
        <TbX />
      </button>
    )}
  </div>
);

// -- Header --------------------------------------------------------------------

const headerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingX: "5",
  paddingTop: "4",
  paddingBottom: "4",
  paddingRight: "[46px]",
  borderBottom: "[1px solid {colors.neutral.a10}]",
  flexShrink: "[0]",
});

const titleStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
  margin: "[0]",
});

const descriptionStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "neutral.s90",
  margin: "[0]",
});

export const Header = ({
  children,
  description,
  titleElement: TitleEl = "h2",
}: {
  children: ReactNode;
  description?: ReactNode;
  titleElement?: "h2" | "span";
}) => (
  <div className={headerStyle}>
    <TitleEl className={titleStyle}>{children}</TitleEl>
    {description != null && <p className={descriptionStyle}>{description}</p>}
  </div>
);

// -- Body ----------------------------------------------------------------------

const bodyStyle = css({
  padding: "5",
  overflowY: "auto",
  flex: "[1]",
});

export const Body = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cx(bodyStyle, className)}>{children}</div>;

// -- Footer --------------------------------------------------------------------

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
  paddingX: "4",
  paddingY: "3",
  flexShrink: "[0]",
  zIndex: "[1]",
});

export const Footer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cx(footerStyle, className)}>{children}</div>;
