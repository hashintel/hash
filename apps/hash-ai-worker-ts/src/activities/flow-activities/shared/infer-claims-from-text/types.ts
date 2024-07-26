import type { SourceProvenance } from "@local/hash-graph-client";

export type Claim = {
  claimId: string;
  subjectEntityLocalId: string;
  objectEntityLocalId?: string;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
};
