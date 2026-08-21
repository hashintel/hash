/**
 * Browser-safe wire contract for the Brunch tools a host UI executes.
 */

export const ASK_TOOL_NAME = "brunch_ask";

export interface BrunchAskInput {
  readonly question: string;
}

export interface BrunchAskOutput {
  readonly answer: string;
}
