import { hashPetrinautDocument } from "@hashintel/petrinaut/ui";

import type { SDCPN } from "@hashintel/petrinaut-core";

/** Content hash of a net definition: equal definitions share one revision. */
export type DocumentRevision = string;

// Definitions are immutable snapshots, so a definition's revision never
// changes once computed.
const revisionsByDefinition = new WeakMap<SDCPN, DocumentRevision>();

export const documentRevisionOf = (definition: SDCPN): DocumentRevision => {
  const cached = revisionsByDefinition.get(definition);
  if (cached !== undefined) return cached;
  const revision = hashPetrinautDocument(definition);
  revisionsByDefinition.set(definition, revision);
  return revision;
};
