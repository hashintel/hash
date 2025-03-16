import type { EntityId, SourceProvenance } from "@blockprotocol/type-system";

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
