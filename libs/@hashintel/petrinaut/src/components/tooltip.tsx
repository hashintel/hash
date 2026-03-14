import { ark } from "@ark-ui/react/factory";
import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { FaInfoCircle } from "react-icons/fa";
import { LuInfo } from "react-icons/lu";

import { usePortalContainerRef } from "../state/portal-container-context";

const tooltipContentStyle = css({
  backgroundColor: "neutral.s120",
  color: "neutral.s10",
  borderRadius: "lg",
  fontSize: "[13px]",
  zIndex: "tooltip",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  padding: "[6px 10px]",
  maxWidth: "[min(300px, var(--available-width))]",
  wordWrap: "break-word",
  fontWeight: "normal",
  textAlign: "left",
  textTransform: "none",
  letterSpacing: "normal",
});

const triggerWrapperStyle = cva({
  variants: {
    display: {
      /** For block-level elements like inputs, selects - takes full width */
      block: {
        display: "block",
      },
      /** For inline elements like buttons in flex containers */
      inline: {
        display: "inline-block",
      },
    },
  },
  defaultVariants: {
    display: "block",
  },
});

interface TooltipProps {
  /**
   * The tooltip content. When empty/undefined, children are rendered without tooltip wrapper.
   */
  content?: string;
  children: ReactNode;
  /**
   * Display mode for the wrapper element.
   * - "block": For full-width elements like inputs/selects (default)
   * - "inline": For inline elements like buttons in flex containers
   */
  display?: "block" | "inline";
  /**
   * Preferred placement of the tooltip relative to the trigger.
   * @default "top"
   */
  placement?: "top" | "bottom" | "left" | "right";
  /**
   * Optional className to apply to the trigger wrapper element.
   */
  className?: string;
}

/**
 * Tooltip component that wraps children and shows a tooltip on hover.
 *
 * Uses a wrapper element to capture pointer events, enabling tooltips on disabled elements.
 * Set `display="inline"` when wrapping inline elements like buttons.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  display = "block",
  placement = "top",
  className,
}) => {
  const portalContainerRef = usePortalContainerRef();

  if (!content) {
    return children;
  }

  return (
    <ArkTooltip.Root
      openDelay={200}
      closeDelay={0}
      positioning={{
        placement,
        flip: true,
        slide: true,
        overflowPadding: 8,
      }}
    >
      <ArkTooltip.Trigger asChild>
        <ark.span className={cx(triggerWrapperStyle({ display }), className)}>
          {children}
        </ark.span>
      </ArkTooltip.Trigger>
      <Portal container={portalContainerRef}>
        <ArkTooltip.Positioner>
          <ArkTooltip.Content className={tooltipContentStyle}>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
};

const circleInfoIconStyle = css({
  display: "inline-block",
  marginLeft: "1",
  marginBottom: "[2px]",
  color: "neutral.s85",
  verticalAlign: "middle",
});

export const InfoIconTooltip = ({
  tooltip,
  outlined,
}: {
  tooltip: string;
  outlined?: boolean;
}) => {
  const Icon = outlined ? LuInfo : FaInfoCircle;

  return (
    <Tooltip content={tooltip} display="inline">
      <Icon size={10} className={circleInfoIconStyle} />
    </Tooltip>
  );
};
