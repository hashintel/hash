/**
 * The status a study shows, as one word with its tone, for the list's chip
 * and the results frame's pill alike. Two states the record does not spell
 * out as a status join the six it does: a connected study that was cancelled
 * is **Stopped** rather than **Cancelled**, because its sampler stays and it
 * can be continued, and a remote study whose event stream is being
 * re-established reads **Reconnecting** whatever its status says.
 */
import type {
  OptimizationRecord,
  OptimizationStatus,
} from "../../../../../../react/optimizations/context";
import type { FrameStatusTone } from "../shared/drawer-frame";

export type OptimizationDisplayStatus =
  | OptimizationStatus
  | "stopped"
  | "reconnecting";

export const optimizationDisplayStatus = (
  optimization: Pick<
    OptimizationRecord,
    "status" | "connected" | "connectionState"
  >,
): OptimizationDisplayStatus => {
  if (optimization.connectionState === "reconnecting") {
    return "reconnecting";
  }
  if (optimization.status === "cancelled" && optimization.connected !== null) {
    return "stopped";
  }
  return optimization.status;
};

export const OPTIMIZATION_STATUS_DISPLAY: Record<
  OptimizationDisplayStatus,
  { label: string; tone: FrameStatusTone }
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
  paused: { label: "Paused", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  stopped: { label: "Stopped", tone: "neutral" },
  reconnecting: { label: "Reconnecting", tone: "active" },
};

/**
 * The label the status pill is sized for, so it never reflows as the status
 * changes. `Initializing` has as many letters but its narrow glyphs make it
 * the shorter of the two.
 */
export const WIDEST_OPTIMIZATION_STATUS =
  OPTIMIZATION_STATUS_DISPLAY.reconnecting.label;
