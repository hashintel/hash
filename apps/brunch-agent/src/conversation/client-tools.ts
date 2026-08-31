/** Flue-side client-tool signal contract: awaiting sentinel, result signal, tool names. */

import { READ_PETRINAUT_DOC_TOOL_NAME } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

export { AWAITING_CLIENT };

export const CLIENT_TOOL_RESULT_SIGNAL = "client-tool-result";

export const clientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOC_TOOL_NAME,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === AWAITING_CLIENT;

export const providerExecutedFor = (clientTool: boolean): true | undefined =>
  clientTool ? undefined : true;
