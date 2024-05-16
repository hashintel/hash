import type { SourceProvenance } from "@local/hash-graph-client";

export type Fact = {
  subjectEntityLocalId: string;
  objectEntityLocalId?: string;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
};
