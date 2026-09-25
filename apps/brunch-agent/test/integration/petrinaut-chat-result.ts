import type { UIMessageChunk } from "ai";

export interface PetrinautChatResult {
  readonly messageId: string | undefined;
  readonly partIds: readonly string[];
  readonly reasoning: string;
  readonly text: string;
  readonly pingCall: Extract<
    UIMessageChunk,
    { type: "tool-input-available" }
  > | null;
  readonly pingOutput: unknown;
  readonly clientToolCall: Extract<
    UIMessageChunk,
    { type: "tool-input-available" }
  > | null;
  readonly clientToolOutputsOnInitial: readonly UIMessageChunk[];
  readonly initialFinish: UIMessageChunk | undefined;
  readonly pendingHistoryClientToolState: string | undefined;
  readonly resumedText: string;
  readonly resumedFinish: UIMessageChunk | undefined;
  readonly questionResponseProviderCalls: number;
  readonly historyUserEntryCount: number;
  readonly historyClientToolResultCount: number;
  readonly historyUserText: string;
  readonly activateSkillCall: Extract<
    UIMessageChunk,
    { type: "tool-input-available" }
  > | null;
  readonly readSkillResourceCall: Extract<
    UIMessageChunk,
    { type: "tool-input-available" }
  > | null;
}
