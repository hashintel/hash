import type { JSONSchema } from "openai/lib/jsonschema";
import type { ChatCompletionMessageToolCall } from "openai/resources";

export type ToolDefinition<ID extends string> = {
  toolId: ID;
  description: string;
  inputSchema: JSONSchema;
};

export type ToolCall<ToolId extends string> = {
  toolId: ToolId;
  openAiToolCall: ChatCompletionMessageToolCall;
  parsedArguments: object;
};

export type CompletedToolCall<ToolId extends string> = {
  redactedOutputMessage?: string;
  output: string;
} & ToolCall<ToolId>;
