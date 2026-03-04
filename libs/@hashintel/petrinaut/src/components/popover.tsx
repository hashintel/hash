import { Popover as ArkPopover } from "@ark-ui/react/popover";
import { Portal } from "@ark-ui/react/portal";
import { css, cx } from "@hashintel/ds-helpers/css";
import type { ComponentProps, ReactNode } from "react";
import { TbX } from "react-icons/tb";

import { usePortalContainerRef } from "../state/portal-container-context";

// -- Styles ------------------------------------------------------------------

const contentStyle = css({
  backgroundColor: "neutral.s25",
  borderRadius: "[12px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 20px 25px -5px rgba(0, 0, 0, 0.1)]",
  overflow: "hidden",
  zIndex: 1000,
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
  paddingX: "[12px]",
  paddingY: "[8px]",
});

const titleStyle = css({
  fontSize: "[12px]",
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
  fontSize: "[14px]",
  color: "neutral.s100",
  backgroundColor: "[transparent]",
  border: "none",
  borderRadius: "[6px]",
  cursor: "pointer",
  _hover: {
    backgroundColor: "[rgba(0, 0, 0, 0.05)]",
  },
});

const sectionStyle = css({
  paddingX: "[4px]",
  paddingBottom: "[4px]",
});

const sectionCardStyle = css({
  backgroundColor: "[white]",
  borderRadius: "[8px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.06), 0px 1px 1px -0.5px rgba(0, 0, 0, 0.04), 0px 4px 4px -12px rgba(0, 0, 0, 0.02), 0px 12px 12px -6px rgba(0, 0, 0, 0.02)]",
  overflow: "hidden",
  padding: "[4px]",
});

const sectionLabelStyle = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s100",
  paddingX: "[8px]",
  paddingTop: "[8px]",
  paddingBottom: "[6px]",
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
    <ArkPopover.CloseTrigger className={closeButtonStyle} aria-label="Close">
      <TbX />
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
