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
  type GrafanaConfig,
  type GrafanaReader,
  type TimeWindow,
} from "./telemetry-readback/grafana.ts";
export {
  parseBrunchLog,
  type ParsedBrunchLog,
} from "./telemetry-readback/parse-log-text.ts";
export {
  renderSubmissionDetail,
  renderSubmissionList,
  summarizeSubmission,
  type SubmissionDetail,
  type SubmissionSummary,
} from "./telemetry-readback/render.ts";
export {
  requestedModelOf,
  turnErrorOf,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type LoggedTurnChronology,
  type ModelCallSpan,
} from "./telemetry-readback/shared/records.ts";
