import { hashPetrinautDocument, type SDCPN } from "@hashintel/petrinaut-core";

/**
 * Content hash of a net definition without its canvas positions: definitions
 * that differ only in layout share one revision, since no net read shows it.
 */
export type DocumentRevision = string;

export const documentRevisionOf = (definition: SDCPN): DocumentRevision =>
  hashPetrinautDocument(definition, { exclude: ["layout"] });
