import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { useEffect, useRef } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import {
  contentStyles,
  positionerStyles,
  triggerStyles,
} from "./tooltip.recipe";

type Direction = "bottom" | "top" | "left" | "right";
export type Position = Direction | `${Direction}-${"start" | "end"}`;
export type Delay = "fast" | "medium" | "slow" | "none";

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

/**
 * Short, non-interactive informational overlay shown on hover or focus.
 *
 * @remarks
 * - Use for brief, read-only hints: a label, a definition, a keyboard shortcut.
 *   Keep `content` to a short phrase or sentence.
 * - Content must stay non-interactive. Tooltips dismiss on blur/pointer-leave, so
 *   buttons, links, or form fields inside one are effectively unreachable.
 * - Prefer {@link Popover} for anything with custom layout, rich or interactive
 *   content, or its own UX (menus, forms, multi-line panels).
 */
export const Tooltip = ({
  className,
  children,
  content,
  position = "top",
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
}) => {
  const portalContainerRef = usePortalContainerRef();
  const triggerRef = useRef<HTMLSpanElement>(null);
  // If the child is not focusable, add a tabindex to the wrapper element to focus it.
  // When the child becomes focusable or the tooltip is disabled, clean up so the
  // wrapper doesn't remain an unexpected tab stop.
  useEffect(() => {
    const wrapper = triggerRef.current;
    if (!wrapper) {
      return;
    }

    const triggerEl = wrapper.firstElementChild as HTMLElement | null;
    const needsFocus =
      !disableTooltip &&
      ((!triggerEl && wrapper.textContent) ||
        (triggerEl && !isDomFocusable(triggerEl)));

    if (needsFocus) {
      wrapper.tabIndex = 0;
    } else {
      wrapper.removeAttribute("tabindex");
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
      <Portal container={portalContainerRef}>
        <ArkTooltip.Positioner className={positionerStyles}>
          <ArkTooltip.Content className={contentStyles({ variant })}>
            {content}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.Root>
  );
};
