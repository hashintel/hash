import { Popover as ArkPopover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ComponentProps, ReactNode } from "react";
import { TbX } from "react-icons/tb";

import { usePortalContainerRef } from "../state/portal-container-context";
import { IconButton } from "./icon-button";

// -- Styles ------------------------------------------------------------------

const contentStyle = css({
  backgroundColor: "neutral.s25",
  borderRadius: "xl",
  boxShadow: "[0px 0px 0px 1px rgba(0, 0, 0, 0.08)]",
  overflow: "hidden",
  zIndex: "dropdown",
  transformOrigin: "var(--transform-origin)",
  '&[data-state="open"]': {
    animation: "popover-in 150ms ease-out",
  },
  '&[data-state="closed"]': {
    animation: "popover-out 100ms ease-in",
  },
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "3",
  paddingY: "2",
});

const titleStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  textTransform: "uppercase",
  letterSpacing: "[0.48px]",
});

const closeButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  fontSize: "sm",
  color: "neutral.s100",
  backgroundColor: "[transparent]",
  border: "none",
  borderRadius: "md",
  cursor: "pointer",
  _hover: {
    backgroundColor: "neutral.bg.min.hover",
  },
});

const sectionStyle = css({
  paddingX: "1",
  paddingBottom: "1",
});

const sectionCardStyle = css({
  backgroundColor: "neutral.s00",
  borderRadius: "lg",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
  overflow: "hidden",
  padding: "1",
});

const sectionLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s100",
  paddingX: "2",
  paddingTop: "2",
  paddingBottom: "1.5",
});

// -- Subcomponents -----------------------------------------------------------

/**
 * Popover content portalled into the shared .petrinaut-root container.
 * Wraps Portal + Positioner + Content from Ark UI.
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
      <ArkPopover.Positioner>
        <ArkPopover.Content className={cx(contentStyle, className)}>
          {children}
        </ArkPopover.Content>
      </ArkPopover.Positioner>
    </Portal>
  );
};

/**
 * Popover header with a title and close button.
 */
const Header = ({ children }: { children: ReactNode }) => (
  <div className={headerStyle}>
    <ArkPopover.Title className={titleStyle}>{children}</ArkPopover.Title>
    <ArkPopover.CloseTrigger asChild>
      <IconButton
        aria-label="Close"
        size="xs"
        variant="ghost"
        className={closeButtonStyle}
      >
        <TbX />
      </IconButton>
    </ArkPopover.CloseTrigger>
  </div>
);

/**
 * Padded section wrapper inside popover content.
 */
const Section = ({ children }: { children: ReactNode }) => (
  <div className={sectionStyle}>{children}</div>
);

/**
 * White card with subtle shadow, used to group related items inside a Section.
 */
const SectionCard = ({ children }: { children: ReactNode }) => (
  <div className={sectionCardStyle}>{children}</div>
);

/**
 * Label for a section card.
 */
const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className={sectionLabelStyle}>{children}</div>
);

// -- Compound export ---------------------------------------------------------

export type PopoverRootProps = ComponentProps<typeof ArkPopover.Root>;

export const Popover = {
  Root: ArkPopover.Root,
  Trigger: ArkPopover.Trigger,
  Content,
  Header,
  Section,
  SectionCard,
  SectionLabel,
};
