import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { cx } from "@hashintel/ds-helpers/css";
import type { RequireExactlyOne } from "type-fest";

import { contentStyles, positionerStyles } from "./tooltip.recipe";

type Direction = "bottom" | "top" | "left" | "right";
type Position = Direction | `${Direction}-${"start" | "end"}`;

function getPositioningOffset(
  position: Position | undefined,
  offsetX: number | undefined,
  offsetY: number | undefined,
) {
  if (offsetX === undefined && offsetY === undefined) {
    return undefined;
  }

  const direction = position?.split("-")[0] ?? "bottom";
  const isVertical = direction === "top" || direction === "bottom";

  return {
    mainAxis: isVertical ? offsetY : offsetX,
    crossAxis: isVertical ? offsetX : offsetY,
  };
}

export const Tooltip = ({
  className,
  children,
  content,
  position = "bottom",
  variant = "dark",
  disableTooltip,
  openDelayMs = 300,
  closeDelayMs = 150,
  offsetX,
  offsetY,
  onOpen,
  onClose,
}: {
  className?: string;
  /** The tooltip trigger */
  children: React.ReactNode;
  /** The content that triggers the tooltip */
  content: React.ReactNode;
  /** The preferred position of the tooltip - depending on the viewport, trigger and content another position may be chosen for better fit */
  position?: Position;
  /** Whether to display a light or dark tooltip */
  variant?: "light" | "dark";
  /** Whether to disable the tooltip */
  disableTooltip?: boolean;
  /** How long before the the tooltip is opened on hover/focus */
  openDelayMs?: number;
  /** How long before the the tooltip is opened when leaving hover/focus */
  closeDelayMs?: number;
  /** The X distance the tooltip will be from the trigger in px */
  offsetX?: number;
  /** The Y distance the tooltip will be from the trigger in px */
  offsetY?: number;
  onOpen?: () => void;
  onClose?: () => void;
} & RequireExactlyOne<
  | {
      content: string;
      /** Whether the tooltip content should act as the accessible description for the content */
      describeChild: true;
    }
  | {
      describeChild?: false;
    }
>) => {
  if (disableTooltip) {
    return children;
  }

  const offset = getPositioningOffset(position, offsetX, offsetY);

  return (
    <ArkTooltip.Root
      openDelay={openDelayMs}
      closeDelay={closeDelayMs}
      positioning={{ placement: position, ...(offset && { offset }) }}
      onOpenChange={
        onOpen || onClose
          ? ({ open }) => {
              if (open) {
                onOpen?.();
              } else {
                onClose?.();
              }
            }
          : undefined
      }
      unmountOnExit
      lazyMount
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner className={positionerStyles}>
          <ArkTooltip.Content
            className={cx(contentStyles({ variant }), className)}
          >
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
};
