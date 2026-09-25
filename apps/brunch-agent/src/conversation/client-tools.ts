/** Flue-side client-tool signal contract: the awaiting sentinel and the tool-call part shape. */

import { awaitingClient } from "@hashintel/brunch-agent";

import type { FlueConversationPart } from "@flue/sdk";

/** A tool call as Flue records it in history; the app's client-tool call shapes project from it. */
export type DynamicToolPart = Extract<
  FlueConversationPart,
  { type: "dynamic-tool" }
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output.awaiting === awaitingClient;
