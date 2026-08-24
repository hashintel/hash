import type { UIMessageChunk } from "ai";

type ToolInputChunk = Extract<UIMessageChunk, { type: "tool-input-available" }>;
type ToolOutputChunk = Extract<
  UIMessageChunk,
  { type: "tool-output-available" }
>;

export interface PetrinautAskResult {
  readonly initialStatus: number;
  readonly askCall: ToolInputChunk | undefined;
  readonly initialToolOutputs: readonly ToolOutputChunk[];
  readonly initialFinish: UIMessageChunk | undefined;
  readonly resumedStatus: number;
  readonly resumedText: string;
  readonly resumedFinish: UIMessageChunk | undefined;
  readonly duplicateStatus: number;
  readonly duplicateBody: unknown;
}
