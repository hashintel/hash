import type { SourceProvenance } from "@local/hash-graph-client/dist/index.d";
import type { EntityId } from "@local/hash-graph-types/entity";

export type Claim = {
  claimId: EntityId;
  subjectEntityLocalId: EntityId;
  objectEntityLocalId?: EntityId | null;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
};

export const claimTextualContentFromClaim = (claim: Claim): string =>
  `${claim.text}${
    claim.prepositionalPhrases.length
      ? `– ${claim.prepositionalPhrases.join(", ")}`
      : ""
  }`;
