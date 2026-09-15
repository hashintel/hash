import type { snapshotToUiMessages } from "@hashintel/brunch-agent-transport-aisdk";

/** Serialized Voice-facing evidence, shared without importing the Node probe. */
export interface AdmissionVoiceEvidence {
  readonly question: string;
  readonly rejectedMessages: ReturnType<typeof snapshotToUiMessages>;
  readonly buffering: readonly {
    readonly caseId: string;
    readonly projectedDuring: ReturnType<typeof snapshotToUiMessages>;
    readonly projectedAfter: ReturnType<typeof snapshotToUiMessages>;
    readonly text: string;
    readonly privateMarkdown: string;
  }[];
}
