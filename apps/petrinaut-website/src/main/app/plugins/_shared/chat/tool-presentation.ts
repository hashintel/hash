/** How a host presents a tool call's row in the transcript. */

/**
 * Lifecycle of a tool call: `"pending"` until it has a result, then
 * `"success"`, or `"error"` when it failed.
 */
export type PetrinautAiToolPresentationState = "pending" | "success" | "error";

/** Color of a tool card in the transcript. */
export type PetrinautAiToolPresentationTone =
  | "danger"
  | "info"
  | "neutral"
  | "pending"
  | "success";

/** A tool call as `resolveToolPresentation` receives it. */
export type PetrinautAiToolPresentationContext = {
  /** Name of the tool the model called. */
  toolName: string;
  /** Where the call is in its lifecycle. */
  state: PetrinautAiToolPresentationState;
  /** Arguments from the model; partial while they are still streaming. */
  input: unknown;
  /** The tool's result; `undefined` until `state` is `"success"`. */
  output: unknown;
  /** Error text when `state` is `"error"`, otherwise `undefined`. */
  error: string | undefined;
};

/** How the transcript shows a tool call, in place of Petrinaut's card text. */
export type PetrinautAiToolPresentation = {
  /** Card title, in place of Petrinaut's summary. */
  title: string;
  /**
   * Text under the title; a failed call shows its error text instead.
   * Omitted: Petrinaut's own detail, unless `items` is set.
   */
  detail?: string;
  /** Card color. Omitted: Petrinaut picks one from the call's state and tool. */
  tone?: PetrinautAiToolPresentationTone;
  /** Lines listed on the card, in place of Petrinaut's own list. */
  items?: readonly string[];
};

/** Returns how to show a tool call, or `undefined` to keep Petrinaut's card. */
export type PetrinautAiToolPresentationResolver = (
  context: PetrinautAiToolPresentationContext,
) => PetrinautAiToolPresentation | undefined;
