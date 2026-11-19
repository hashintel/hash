import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

/**
 * What a record ran on, and why the one asked for declined when it did. The
 * simulator's name is optional, for the records that never had one.
 */
export type ComputeBackendSummary = Pick<
  ExperimentRecord,
  "computeBackend" | "computeBackendFallbackReason"
> &
  Partial<Pick<ExperimentRecord, "simulatorLabel">>;

// Local rather than the design system's `Badge`, whose `brand` scheme puts
// #5EB1EF on a near-white #FBFDFF — about 2.3:1, below the 4.5:1 WCAG AA
// needs for text this size.
// 18px tall, like the status pill and the computing chip it shares the
// header's strip with.
const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  height: "[18px]",
  borderRadius: "sm",
  fontSize: "xs",
  lineHeight: "[18px]",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
  "&[data-tone=active]": {
    color: "blue.s100",
    backgroundColor: "blue.s10",
  },
});

const describeComputeBackend = (backend: ComputeBackendSummary): string => {
  if (backend.computeBackend === "webgpu") {
    return "Stepped on the GPU through WebGPU. Distributions match the CPU backend statistically — real-valued metrics are binned to a calibrated window; individual trajectories differ (different random generators).";
  }
  const computed = backend.simulatorLabel
    ? `Computed by ${backend.simulatorLabel}, across worker threads.`
    : "Stepped on the CPU, across worker threads.";
  if (backend.computeBackendFallbackReason !== null) {
    // The notification that carried this is gone by the time anyone wonders
    // why the results are not the ones asked for.
    return backend.simulatorLabel
      ? `${computed} The simulator asked for could not run this net: ${backend.computeBackendFallbackReason}`
      : `The GPU backend was requested but could not run this net: ${backend.computeBackendFallbackReason}`;
  }
  return computed;
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
        {backend.simulatorLabel ?? (isGpu ? "GPU" : "CPU")}
      </span>
    </Tooltip>
  );
};
