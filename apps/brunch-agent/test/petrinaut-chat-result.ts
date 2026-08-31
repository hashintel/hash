import type { UIMessageChunk } from "ai";

export interface PetrinautChatResult {
  readonly status: number;
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
  readonly resumedStatus: number;
  readonly resumedText: string;
  readonly resumedFinish: UIMessageChunk | undefined;
  readonly historyGetStatus: number;
  readonly historyUserText: string;
  readonly foreignHistoryMessages: number;
  readonly unauthenticatedHistoryStatus: number;
  readonly foreignAgentHistoryStatus: number;
  readonly transcript: string;
  readonly instanceId: string;
  readonly dbPath: string;
  readonly activateSkillCall: Extract<
    UIMessageChunk,
    { type: "tool-input-available" }
  > | null;
  readonly interviewerToolNames: readonly string[];
  readonly captureUserText: string;
  readonly captureIds: readonly string[];
  readonly recaptureIds: readonly string[];
  readonly skippedDedupKeys: readonly string[];
  readonly capturePayloads: readonly unknown[];
  readonly captureExcerpts: readonly string[];
}

export interface PetrinautResumeResult {
  readonly historyGetStatus: number;
  readonly historyUserText: string;
  readonly transcript: string;
}
