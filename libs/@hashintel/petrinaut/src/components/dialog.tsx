import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ComponentProps, ReactNode } from "react";
import { TbX } from "react-icons/tb";

import { usePortalContainerRef } from "../state/portal-container-context";

// -- Styles ------------------------------------------------------------------

const backdropStyle = css({
  position: "fixed",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  left: "[0]",
  backgroundColor: "[rgba(0, 0, 0, 0.4)]",
  backdropFilter: "[blur(4px)]",
  zIndex: "[1100]",
  "&[data-state=open]": {
    animation: "dialogBackdropIn 150ms ease-out",
  },
  "&[data-state=closed]": {
    animation: "dialogBackdropOut 100ms ease-in",
  },
});

const positionerStyle = css({
  position: "fixed",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  left: "[0]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  zIndex: "[1100]",
});

/** Outer gray container — matches Figma "size=sm, glass=false" frame. */
const outerStyle = css({
  backgroundColor: "[#fcfcfc]",
  borderRadius: "[16px]",
  padding: "[4px]",
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  maxWidth: "[400px]",
  width: "[90vw]",
  maxHeight: "[85vh]",
  overflow: "clip",
  userSelect: "none",
  boxShadow:
    "[0px 0px 1px 0px rgba(0,0,0,0.02), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 6px 6px -3px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.03), 0px 24px 24px -12px rgba(0,0,0,0.02)]",
  "&[data-state=open]": {
    animation: "dialogContentIn 150ms ease-out",
  },
  "&[data-state=closed]": {
    animation: "dialogContentOut 100ms ease-in",
  },
});

/** Inner white card that holds header + body. */
const cardStyle = css({
  position: "relative",
  backgroundColor: "[white]",
  borderRadius: "[12px]",
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

const closeButtonStyle = css({
  position: "absolute",
  top: "[8px]",
  right: "[8px]",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[30px]",
  height: "[30px]",
  fontSize: "[16px]",
  color: "neutral.s100",
  backgroundColor: "[transparent]",
  border: "none",
  borderRadius: "[8px]",
  cursor: "pointer",
  zIndex: "[3]",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const headerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  paddingX: "[20px]",
  paddingTop: "[16px]",
  paddingBottom: "[16px]",
  paddingRight: "[46px]",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.02)]",
  flexShrink: "[0]",
});

const titleStyle = css({
  fontSize: "[18px]",
  fontWeight: "semibold",
  lineHeight: "[20px]",
  color: "[#171717]",
  margin: "[0]",
});

const descriptionStyle = css({
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "[#8d8d8d]",
  margin: "[0]",
});

const bodyStyle = css({
  padding: "[20px]",
  overflowY: "auto",
  flex: "[1]",
});

const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "[8px]",
  paddingX: "[16px]",
  paddingY: "[12px]",
  flexShrink: "[0]",
  zIndex: "[1]",
});

// -- Subcomponents -----------------------------------------------------------

/**
 * Dialog content portalled into the shared .petrinaut-root container.
 * Renders the outer gray frame that wraps both the Card and Footer.
 */
const Content = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const portalContainerRef = usePortalContainerRef();

  return (
    <Portal container={portalContainerRef}>
      <ArkDialog.Backdrop className={backdropStyle} />
      <ArkDialog.Positioner className={positionerStyle}>
        <ArkDialog.Content className={cx(outerStyle, className)}>
          {children}
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </Portal>
  );
};

/**
 * Inner white card that holds Header + Body.
 * Includes an absolute-positioned close button in the top-right corner.
 */
const Card = ({ children }: { children: ReactNode }) => (
  <div className={cardStyle}>
    {children}
    <ArkDialog.CloseTrigger className={closeButtonStyle} aria-label="Close">
      <TbX />
    </ArkDialog.CloseTrigger>
  </div>
);

/**
 * Dialog header with title and optional description.
 * Sits inside Card, has a subtle bottom border.
 */
const Header = ({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) => (
  <div className={headerStyle}>
    <ArkDialog.Title className={titleStyle}>{children}</ArkDialog.Title>
    {description != null && (
      <ArkDialog.Description className={descriptionStyle}>
        {description}
      </ArkDialog.Description>
    )}
  </div>
);

/**
 * Scrollable body area inside the Card.
 */
const Body = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cx(bodyStyle, className)}>{children}</div>;

/**
 * Footer area for action buttons. Sits outside the Card,
 * in the outer gray frame.
 */
const Footer = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cx(footerStyle, className)}>{children}</div>;

// -- Compound export ---------------------------------------------------------

export type DialogRootProps = ComponentProps<typeof ArkDialog.Root>;

export const Dialog = {
  Root: ArkDialog.Root,
  Trigger: ArkDialog.Trigger,
  Content,
  Card,
  Header,
  Title: ArkDialog.Title,
  Description: ArkDialog.Description,
  Body,
  Footer,
  CloseTrigger: ArkDialog.CloseTrigger,
};
