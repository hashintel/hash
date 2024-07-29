import type { SourceProvenance } from "@local/hash-graph-client";
import type { EntityId } from "@local/hash-graph-types/entity";

export type Claim = {
  claimId: EntityId;
  subjectEntityLocalId: EntityId;
  objectEntityLocalId?: EntityId;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
};
