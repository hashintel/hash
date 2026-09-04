import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

/** Which backend a record ran on, and why the GPU declined when it did. */
export type ComputeBackendSummary = Pick<
  ExperimentRecord,
  "computeBackend" | "computeBackendFallbackReason"
>;

// Local rather than the design system's `Badge`, whose `brand` scheme puts
// #5EB1EF on a near-white #FBFDFF — about 2.3:1, below the 4.5:1 WCAG AA
// needs for text this size.
const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  paddingY: "[2px]",
  borderRadius: "sm",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
  "&[data-tone=active]": {
    color: "blue.s100",
    backgroundColor: "blue.s10",
  },
});

export const describeComputeBackend = (
  backend: ComputeBackendSummary,
): string => {
  if (backend.computeBackend === "webgpu") {
    return "Stepped on the GPU through WebGPU. Distributions match the CPU backend statistically; individual trajectories differ (different random generators).";
  }
  if (backend.computeBackendFallbackReason !== null) {
    // The notification that carried this is gone by the time anyone wonders
    // why the results are not GPU-backed.
    return `The GPU backend was requested but could not run this net: ${backend.computeBackendFallbackReason}`;
  }
  return "Stepped on the CPU, across worker threads.";
};

export const ComputeBackendBadge = ({
  backend,
}: {
  backend: ComputeBackendSummary;
}) => {
  const isGpu = backend.computeBackend === "webgpu";

  return (
    <Tooltip content={describeComputeBackend(backend)} position="bottom-end">
      <span className={badgeStyle} data-tone={isGpu ? "active" : "neutral"}>
        {isGpu ? <Icon name="lightning" size="xs" /> : null}
        {isGpu ? "GPU" : "CPU"}
      </span>
    </Tooltip>
  );
};
