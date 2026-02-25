import { ark } from "@ark-ui/react/factory";
import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

import { usePortalContainerRef } from "../state/portal-container-context";

const tooltipContentStyle = css({
  backgroundColor: "neutral.s120",
  color: "neutral.s10",
  borderRadius: "xl",
  fontSize: "[13px]",
  zIndex: "[10000]",
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
        placement: "top",
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
  width: "[11px]",
  height: "[11px]",
  marginLeft: "[6.4px]",
  marginBottom: "[1.6px]",
  color: "[rgb(160, 160, 160)]",
  verticalAlign: "middle",
  fill: "[currentColor]",
});

const CircleInfoIcon = () => {
  return (
    <svg
      className={circleInfoIconStyle}
      viewBox="0 0 512 512"
      aria-hidden="true"
    >
      <path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256s256-114.6 256-256S397.4 0 256 0zM256 464c-114.7 0-208-93.31-208-208S141.3 48 256 48s208 93.31 208 208S370.7 464 256 464zM296 336h-16V248C280 234.8 269.3 224 256 224H224C210.8 224 200 234.8 200 248S210.8 272 224 272h8v64h-16C202.8 336 192 346.8 192 360S202.8 384 216 384h80c13.25 0 24-10.75 24-24S309.3 336 296 336zM256 192c17.67 0 32-14.33 32-32c0-17.67-14.33-32-32-32S224 142.3 224 160C224 177.7 238.3 192 256 192z" />
    </svg>
  );
};

export const InfoIconTooltip = ({ tooltip }: { tooltip: string }) => {
  return (
    <Tooltip content={tooltip} display="inline">
      <CircleInfoIcon />
    </Tooltip>
  );
};
