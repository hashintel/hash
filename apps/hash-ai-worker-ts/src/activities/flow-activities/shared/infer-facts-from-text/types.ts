import type { SourceProvenance } from "@local/hash-graph-client";

export interface Fact {
  factId: string;
  subjectEntityLocalId: string;
  objectEntityLocalId?: string;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
}
