/**
 * The body of a study, shared by the drawer and the full view: the summary
 * strip, the navigator band, the surface beside the objective's chart, and
 * the steps table. The pieces live in `study-view/`; this file is the one
 * place the two surfaces import them from.
 */
export {
  ContinueControl,
  remainingOptimizationSteps,
} from "./study-view/continue-control";
export { NavigatorBand } from "./study-view/navigator-band";
export { OptimizationMetrics } from "./study-view/optimization-metrics";
export { StepsTable } from "./study-view/steps-table";
export { StudySummaryStrip } from "./study-view/study-summary-strip";
