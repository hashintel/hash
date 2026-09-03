/** Flue-side client-tool signal contract: awaiting sentinel, result signal, tool names. */

import {
  PETRINAUT_FIXTURE_TOOL_NAMES,
  READ_PETRINAUT_DOC_TOOL_NAME,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { CLIENT_TOOL_RESULT_SIGNAL } from "@hashintel/brunch-agent-transport-aisdk";
import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

export { AWAITING_CLIENT };
export { CLIENT_TOOL_RESULT_SIGNAL };

export const clientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOC_TOOL_NAME,
  ...PETRINAUT_FIXTURE_TOOL_NAMES,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === AWAITING_CLIENT;

export const providerExecutedFor = (clientTool: boolean): true | undefined =>
  clientTool ? undefined : true;
