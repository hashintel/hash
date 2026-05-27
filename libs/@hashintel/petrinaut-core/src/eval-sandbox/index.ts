export type {
  CompileScenarioArgs,
  CompiledMetric,
  CompiledScenarioResult,
  CompileScenarioOutcome,
  CoreEvalSandbox,
  MetricEvaluator,
  MetricState,
} from "./interface";

export { createInlineCoreSandbox } from "./inline";

export {
  createIframeCoreSandbox,
  type CreateIframeCoreSandboxOptions,
} from "./iframe";

export type {
  ParentRequest,
  ParentToSandboxMessage,
  RequestId,
  SandboxResourceId,
  SandboxResponse,
  SandboxToParentMessage,
  SandboxWorkerKind,
  SerializedError,
} from "./protocol";

export { deserializeError, serializeError } from "./protocol";

export { mountCoreSandboxRuntime } from "./runtime-core";
