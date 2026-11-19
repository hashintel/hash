import {
  hashPetrinautDocument,
  petrinautNonSemanticParts,
  type SDCPN,
} from "@hashintel/petrinaut-core";

/**
 * Content hash of a net definition without layout, descriptions, appearance
 * or metadata. Changes to those parts leave the model's semantic view current.
 */
export type DocumentRevision = string;

export const documentRevisionOf = (definition: SDCPN): DocumentRevision =>
  hashPetrinautDocument(definition, { exclude: petrinautNonSemanticParts });
