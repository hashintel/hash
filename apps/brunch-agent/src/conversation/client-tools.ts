/** Flue-side client-tool signal contract: awaiting sentinel, result delivery, client tool names. */

import { awaitingClient, brunchTools } from "@hashintel/brunch-agent";
import { isClientToolResultDelivery } from "@hashintel/brunch-agent-transport-aisdk";

import type { FlueConversationPart } from "@flue/sdk";

export { isClientToolResultDelivery };

/** A tool call as Flue records it in history; the app's client-tool call shapes project from it. */
export type DynamicToolPart = Extract<
  FlueConversationPart,
  { type: "dynamic-tool" }
>;
/** What a client-tool host needs to execute one call. */
export type ClientToolCall = Pick<
  DynamicToolPart,
  "toolCallId" | "toolName" | "input"
>;

export const clientToolNames: ReadonlySet<string> = new Set([
  brunchTools.readPetrinautDocs,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === awaitingClient;

export const providerExecutedFor = (clientTool: boolean): true | undefined =>
  clientTool ? undefined : true;
