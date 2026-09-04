/**
 * The CPU/GPU choice of a compute form: the two backend names with a switch
 * between them, disabled — the reason on a tooltip — while the GPU cannot run
 * the request. Its root publishes `data-backend-state` as `pending`,
 * `available` or `unavailable`, since a disabled switch alone cannot say
 * whether the analysis is still running or came back negative.
 */
import { use } from "react";

import { Toggle, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";

import type { GpuAvailability } from "./use-gpu-availability";

const controlStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  flexShrink: "[0]",
  // Matches the height the sibling inputs occupy, so a form row's baselines
  // line up rather than the control floating in a shorter cell.
  minHeight: "[34px]",
});

const sideLabelStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1]",
  // Muted until selected, so the toggle's position reads as a choice between two
  // named backends rather than an unlabelled on/off.
  color: "neutral.s100",
  transition: "[color 0.15s ease]",
  "&[data-selected=true]": {
    color: "neutral.s120",
  },
});

/**
 * The GPU side is purple rather than neutral, so the accelerated path is visibly
 * a different thing and not merely the toggle in its other position.
 */
const gpuSideLabelStyle = css({
  "&[data-selected=true]": {
    color: "purple.s90",
  },
});

/*
 * The design system's toggle has no purple tone, and adding one there would change
 * a shared component for one screen's sake. These reach into its parts from
 * outside instead: `&[data-state='checked'] [data-part='control']` is one
 * selector more specific than the recipe's own `&[data-state='checked']`, so it
 * wins without `!important`.
 */
const gpuToggleStyle = css({
  "&[data-state='checked'] [data-part='control']": {
    backgroundColor: "purple.s80",
  },
  "&[data-state='checked']:hover:not([data-disabled]) [data-part='control']": {
    backgroundColor: "purple.s70",
  },
});

const gpuToggleGlowStyle = css({
  "&[data-state='checked'] [data-part='control']": {
    animationName: "[petrinautGpuGlow]",
    animationDuration: "[2.4s]",
    animationIterationCount: "[infinite]",
    animationTimingFunction: "ease-in-out",
  },
});

export const ComputeBackendToggle = ({
  gpu,
  selected,
  onSelectedChange,
}: {
  gpu: GpuAvailability;
  /** Whether the GPU side is on; derive it from `gpu.available` too. */
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) => {
  const { showAnimations } = use(UserSettingsContext);

  return (
    <Tooltip
      content={gpu.reason ?? ""}
      disableTooltip={gpu.reason === null}
      position="top-start"
    >
      {/* Wrapped so the tooltip still opens while the control is disabled — a
          disabled control fires no pointer events. */}
      <span
        className={controlStyle}
        data-backend-state={
          gpu.pending ? "pending" : gpu.available ? "available" : "unavailable"
        }
      >
        <span className={sideLabelStyle} data-selected={!selected}>
          CPU
        </span>
        <Toggle
          size="sm"
          value={selected}
          onChange={onSelectedChange}
          disabled={!gpu.available}
          className={cx(gpuToggleStyle, showAnimations && gpuToggleGlowStyle)}
        />
        <span
          className={cx(sideLabelStyle, gpuSideLabelStyle)}
          data-selected={selected}
        >
          GPU
        </span>
      </span>
    </Tooltip>
  );
};
