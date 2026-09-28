import type { FlueAiSdkAdapter } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

type ReopenedMessages = ReturnType<FlueAiSdkAdapter<UIMessage>["reopen"]>;

/** Serialized Voice-facing evidence, shared without importing the Node probe. */
export interface AdmissionVoiceEvidence {
  readonly question: string;
  readonly buffering: readonly {
    readonly caseId: string;
    readonly projectedDuring: ReopenedMessages;
    readonly projectedAfter: ReopenedMessages;
    readonly text: string;
    readonly privateMarkdown: string;
  }[];
}
