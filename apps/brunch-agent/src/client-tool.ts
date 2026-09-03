/** Flue-side client-tool signal contract: awaiting sentinel, result signal, tool names. */

import { ASK_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";
import {
  getLatestNetDefinitionToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

export const CLIENT_TOOL_RESULT_SIGNAL = "client-tool-result";

export const AWAITING_CLIENT = "client" as const;

export const clientToolNames: ReadonlySet<string> = new Set([
  ASK_TOOL_NAME,
  getLatestNetDefinitionToolName,
  readPetrinautDocToolName,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === AWAITING_CLIENT;

export const providerExecutedFor = (clientTool: boolean): true | undefined =>
  clientTool ? undefined : true;
