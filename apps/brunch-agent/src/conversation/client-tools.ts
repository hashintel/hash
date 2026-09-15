/** Flue-side client-tool signal contract: awaiting sentinel, result signal, tool names. */

import {
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  petrinautFixtureToolNames,
  READ_PETRINAUT_DOCS_TOOL_NAME,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import {
  CLIENT_TOOL_RESULT_SIGNAL,
  isClientToolResultDelivery,
} from "@hashintel/brunch-agent-transport-aisdk";
import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import type { FlueConversationPart } from "@flue/sdk";

export { AWAITING_CLIENT };
export { CLIENT_TOOL_RESULT_SIGNAL, isClientToolResultDelivery };

// Flue's built-in skill tools; Flue exports no constants for their names.
export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";
export const READ_SKILL_RESOURCE_TOOL_NAME = "read_skill_resource";

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
  READ_PETRINAUT_DOCS_TOOL_NAME,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  ...petrinautFixtureToolNames,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === AWAITING_CLIENT;

export const providerExecutedFor = (clientTool: boolean): true | undefined =>
  clientTool ? undefined : true;
