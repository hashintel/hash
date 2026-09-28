import type { snapshotToUiMessages } from "@local/flue-aisdk-transport";

/** Serialized Voice-facing evidence, shared without importing the Node probe. */
export interface AdmissionVoiceEvidence {
  readonly question: string;
  readonly buffering: readonly {
    readonly caseId: string;
    readonly projectedDuring: ReturnType<typeof snapshotToUiMessages>;
    readonly projectedAfter: ReturnType<typeof snapshotToUiMessages>;
    readonly text: string;
    readonly privateMarkdown: string;
  }[];
}
