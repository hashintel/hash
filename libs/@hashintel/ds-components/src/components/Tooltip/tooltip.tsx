import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { cx } from "@hashintel/ds-helpers/css";
import { useEffect, useRef } from "react";
import type { RequireExactlyOne } from "type-fest";

import {
  contentStyles,
  positionerStyles,
  triggerStyles,
} from "./tooltip.recipe";

type Direction = "bottom" | "top" | "left" | "right";
type Position = Direction | `${Direction}-${"start" | "end"}`;
type Delay = "fast" | "medium" | "slow" | "none";

const openDelayMsMap = {
  none: 0,
  fast: 200,
  medium: 500,
  slow: 1000,
};

const closeDelayMsMap = {
  none: 0,
  fast: 100,
  medium: 200,
  slow: 300,
};

function isDomFocusable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) {
    return false;
  }
  if ("disabled" in el && (el as HTMLButtonElement).disabled) {
    return false;
  }
  return true;
}

function getPositioningOffset(position: Position, gapX: number, gapY: number) {
  const direction = position.split("-")[0] ?? "bottom";
  const isVertical = direction === "top" || direction === "bottom";

  return {
    mainAxis: isVertical ? gapY : gapX,
  };
}

export const Tooltip = ({
  className,
  children,
  content,
  position = "bottom",
  variant = "dark",
  disableTooltip,
  openDelay = "medium",
  closeDelay = "medium",
  gapX = 8,
  gapY = 8,
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
  openDelay?: Delay;
  /** How long before the the tooltip is opened when leaving hover/focus */
  closeDelay?: Delay;
  /** The X distance the tooltip will be from the trigger in px */
  gapX?: number;
  /** The Y distance the tooltip will be from the trigger in px */
  gapY?: number;
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
  const triggerRef = useRef<HTMLSpanElement>(null);

  // If the child is not focusable, add a tabindex to the wrapper element to focus it
  useEffect(() => {
    if (disableTooltip) {
      return;
    }

    const triggerEl = triggerRef.current
      ?.firstElementChild as HTMLElement | null;

    // If the trigger element is plain text
    if (triggerRef.current && !triggerEl && triggerRef.current.textContent) {
      triggerRef.current.tabIndex = 0;
      // Or if the trigger element is not focusable
    } else if (triggerRef.current && triggerEl && !isDomFocusable(triggerEl)) {
      triggerRef.current.tabIndex = 0;
      triggerRef.current.role = "button";
    }
  }, [children, disableTooltip]);

  const wrappedChildren = (
    <span ref={triggerRef} className={cx(triggerStyles, className)}>
      {children}
    </span>
  );

  if (disableTooltip) {
    return wrappedChildren;
  }

  const offset = getPositioningOffset(position, gapX, gapY);

  return (
    <ArkTooltip.Root
      openDelay={openDelayMsMap[openDelay]}
      closeDelay={closeDelayMsMap[closeDelay]}
      positioning={{ placement: position, offset }}
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
      <ArkTooltip.Trigger asChild>{wrappedChildren}</ArkTooltip.Trigger>
      <Portal>
        <ArkTooltip.Positioner className={positionerStyles}>
          <ArkTooltip.Content className={contentStyles({ variant })}>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
};
