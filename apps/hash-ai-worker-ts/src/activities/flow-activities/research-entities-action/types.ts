import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
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
  output: string;
} & ToolCall<ToolId>;

export type ProposedEntityWithLocalId = ProposedEntity & { localId: string };
