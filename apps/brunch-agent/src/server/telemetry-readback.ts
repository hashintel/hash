/**
 * Reads Brunch's provider telemetry back for diagnosis: the per-submission
 * chronology and `provider.timeout` log lines, and each model call's span.
 *
 * Content policy: metadata only. Log lines are read for their structured
 * fields and spans for an allowlist of attributes; prompts, output and error
 * messages are never read.
 */

export {
  createGrafanaReader,
  type TimeWindow,
} from "./telemetry-readback/grafana.ts";
export { parseBrunchLog } from "./telemetry-readback/parse-log-text.ts";
export {
  idleTimeoutsOf,
  renderSubmissionDetail,
  renderSubmissionList,
  seconds,
  summarizeSubmission,
  table,
  type SubmissionDetail,
} from "./telemetry-readback/render.ts";
export {
  requestedModelOf,
  turnErrorOf,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type ReadResult,
} from "./telemetry-readback/shared/records.ts";
