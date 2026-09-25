import { Portal } from "@ark-ui/react/portal";
import { Tooltip as ArkTooltip, useTooltip } from "@ark-ui/react/tooltip";
import { useEffect, useRef } from "react";

import { isRejectedNumberInputKey } from "../../util/form-shared";
import { usePortalContainerRef } from "../../util/portal-container-context";
import { positionerStyles as tooltipPositionerStyles } from "../Tooltip/base-tooltip.recipe";

// A strike this long after the previous one starts a new streak: isolated
// typos, however many over a session, never surface the hint.
const strikeStreakResetMs = 2000;
const hintAutoHideMs = 4000;
const firstShowingStreak = 3;
const laterShowingStreak = 6;

/**
 * A last-resort hint around a number input that keeps rejecting keystrokes:
 * `flashInvalidInput` is easy to miss or mistake for a glitch, so once
 * enough keys bounce in quick succession a tooltip below the input spells
 * out what it accepts. Each rejected key is a strike; strikes more than
 * {@link strikeStreakResetMs} apart start a new streak, so a stray keypress
 * never triggers it. A streak of {@link firstShowingStreak} shows the hint,
 * which auto-hides after {@link hintAutoHideMs}; later showings (the user
 * may have missed the first, but probably didn't) need the longer
 * {@link laterShowingStreak}. An accepted printable key resets the streak,
 * blur and Escape dismiss the hint immediately, and an operator switch
 * remounts the input, starting afresh.
 *
 * The wrapper span classifies the input's bubbled key events itself, with
 * the same {@link isRejectedNumberInputKey} predicate the input rejects by
 * (held-key repeats count once — one user action).
 */
export const RejectedKeysHint = ({
  integer,
  triggerClassName,
  contentClassName,
  children,
}: {
  integer: boolean;
  triggerClassName: string | undefined;
  contentClassName: string | undefined;
  children: React.ReactNode;
}) => {
  const portalContainerRef = usePortalContainerRef();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const trackerRef = useRef({ strikes: 0, lastStrikeAt: 0, showings: 0 });
  const hideTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hideTimerRef.current), []);

  // Deliberately no ArkTooltip.Trigger: a trigger's merged hover/focus
  // handlers open the machine by themselves (a focused text input counts as
  // :focus-visible even on mouse focus), and the `open` prop does not
  // suppress machine-initiated transitions. Without a trigger the machine
  // only ever transitions through `tooltip.setOpen`, and the wrapper's rect
  // anchors the positioner instead.
  const tooltip = useTooltip({
    openDelay: 0,
    closeDelay: 0,
    positioning: {
      placement: "bottom",
      offset: { mainAxis: 4 },
      getAnchorRect: () => wrapperRef.current?.getBoundingClientRect() ?? null,
    },
  });

  const dismiss = () => {
    window.clearTimeout(hideTimerRef.current);
    tooltip.setOpen(false);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      dismiss();
      return;
    }
    if (isRejectedNumberInputKey(event, integer)) {
      if (event.repeat) {
        return;
      }
      const tracker = trackerRef.current;
      tracker.strikes =
        event.timeStamp - tracker.lastStrikeAt > strikeStreakResetMs
          ? 1
          : tracker.strikes + 1;
      tracker.lastStrikeAt = event.timeStamp;
      const required =
        tracker.showings === 0 ? firstShowingStreak : laterShowingStreak;
      if (tooltip.open || tracker.strikes < required) {
        return;
      }
      tracker.showings += 1;
      tracker.strikes = 0;
      tooltip.setOpen(true);
      hideTimerRef.current = window.setTimeout(() => {
        tooltip.setOpen(false);
      }, hintAutoHideMs);
    } else if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      trackerRef.current.strikes = 0;
    }
  };

  return (
    <ArkTooltip.RootProvider value={tooltip} lazyMount unmountOnExit>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- not interactive itself: only observes the inner <input>'s bubbled events */}
      <span
        ref={wrapperRef}
        className={triggerClassName}
        onKeyDown={handleKeyDown}
        onBlur={dismiss}
      >
        {children}
      </span>
      <Portal container={portalContainerRef}>
        <ArkTooltip.Positioner className={tooltipPositionerStyles}>
          <ArkTooltip.Content className={contentClassName}>
            {integer
              ? "Value must be a whole number"
              : "Value must be a number or decimal"}
          </ArkTooltip.Content>
        </ArkTooltip.Positioner>
      </Portal>
    </ArkTooltip.RootProvider>
  );
};
