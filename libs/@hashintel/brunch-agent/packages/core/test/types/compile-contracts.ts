import { toolName, type ToolName } from "../../src/conversation/naming";

import type {
  EvidenceSpan,
  UserCaptureInputProposal,
} from "../../src/evidence/capture-store";

const askToolName: ToolName<"ask"> = toolName("ask");
void askToolName;

// @ts-expect-error -- "aks" is not a declared operation.
toolName("aks");

const callerEvidence: UserCaptureInputProposal["evidence"] = [
  { excerpt: "June works." },
];
void callerEvidence;

const callerEvidenceWithPointer: UserCaptureInputProposal["evidence"] = [
  {
    excerpt: "June works.",
    // @ts-expect-error -- Entry ranges are harness-owned.
    pointer: { sessionId: "session-1", entryStart: 1, entryEnd: 1 },
  },
];
void callerEvidenceWithPointer;

const storedSpan: EvidenceSpan = {
  excerpt: "June works.",
  pointer: { sessionId: "session-1", entryStart: 1, entryEnd: 1 },
  source: "user",
};

// @ts-expect-error -- Stored evidence is not caller quote input.
const callerQuote: UserCaptureInputProposal["evidence"][number] = storedSpan;
void callerQuote;
