import type { SourceProvenance } from "@local/hash-graph-client";
import type { EntityId } from "@local/hash-graph-types/entity";

export type Claim = {
  claimId: EntityId;
  subjectEntityLocalId: string;
  objectEntityLocalId?: string;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
};
