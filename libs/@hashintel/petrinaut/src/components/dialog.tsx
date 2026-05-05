import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ComponentProps, ReactNode } from "react";
import { TbX } from "react-icons/tb";

import { usePortalContainerRef } from "../state/portal-container-context";
import {
  Body,
  Card as PanelCard,
  closeButtonStyle,
  Footer,
  Header as PanelHeader,
  outerStyle,
} from "./panel-primitives";

// -- Dialog-specific styles ---------------------------------------------------

const backdropStyle = css({
  position: "fixed",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  left: "[0]",
  backgroundColor: "[rgba(0, 0, 0, 0.4)]",
  zIndex: "sticky",
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
  zIndex: "sticky",
});

const dialogOuterStyle = css({
  maxWidth: "[400px]",
  width: "[90vw]",
  maxHeight: "[85vh]",
  "&[data-state=open]": {
    animation: "dialogContentIn 150ms ease-out",
  },
  "&[data-state=closed]": {
    animation: "dialogContentOut 100ms ease-in",
  },
});

// -- Subcomponents -----------------------------------------------------------

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
        <ArkDialog.Content
          className={cx(outerStyle, dialogOuterStyle, className)}
        >
          {children}
        </ArkDialog.Content>
      </ArkDialog.Positioner>
    </Portal>
  );
};

const Card = ({ children }: { children: ReactNode }) => (
  <PanelCard
    closeButton={
      <ArkDialog.CloseTrigger className={closeButtonStyle} aria-label="Close">
        <TbX />
      </ArkDialog.CloseTrigger>
    }
  >
    {children}
  </PanelCard>
);

const Header = ({
  children,
  description,
}: {
  children: ReactNode;
  description?: ReactNode;
}) => <PanelHeader description={description}>{children}</PanelHeader>;

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
