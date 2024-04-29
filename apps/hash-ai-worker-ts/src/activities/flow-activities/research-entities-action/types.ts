import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types";

export type CompletedToolCall<ToolId extends string> = {
  redactedOutputMessage?: string;
  output: string;
  isError?: true;
} & ParsedLlmToolCall<ToolId>;
