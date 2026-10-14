import { hashPetrinautDocument, type SDCPN } from "@hashintel/petrinaut-core";

/** Content hash of a net definition: equal definitions share one revision. */
export type DocumentRevision = string;

export const documentRevisionOf = (definition: SDCPN): DocumentRevision =>
  hashPetrinautDocument(definition);
