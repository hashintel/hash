/**
 * OpenTelemetry workflow interceptors.
 *
 * Used as a workflow module via Temporal's `workflowModules` option so the
 * upstream `@temporalio/interceptors-opentelemetry` interceptors can run
 * inside the workflow sandbox. Pair with the worker-side
 * `makeWorkflowExporter` sink so the spans created here are exported to
 * the worker's OTEL trace provider.
 */
import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryInternalsInterceptor,
  OpenTelemetryOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry";
import type { WorkflowInterceptors } from "@temporalio/workflow";

export const interceptors = (): WorkflowInterceptors => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});
