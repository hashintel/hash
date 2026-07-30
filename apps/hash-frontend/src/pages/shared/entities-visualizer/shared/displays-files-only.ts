import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { SpecialEntityTypeRecord } from "../../../../shared/entity-types-context/shared/context-types";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * @todo: avoid having to maintain this list, potentially by
 * adding an `isFile` boolean to the generated ontology IDs file.
 */
const allFileEntityTypeOntologyIds = [
  systemEntityTypes.file,
  systemEntityTypes.imageFile,
  systemEntityTypes.documentFile,
  systemEntityTypes.docxDocument,
  systemEntityTypes.pdfDocument,
  systemEntityTypes.presentationFile,
  systemEntityTypes.pptxPresentation,
];

const allFileEntityTypeIds = allFileEntityTypeOntologyIds.map(
  ({ entityTypeId }) => entityTypeId,
) as VersionedUrl[];

const allFileEntityTypeBaseUrl = allFileEntityTypeOntologyIds.map(
  ({ entityTypeBaseUrl }) => entityTypeBaseUrl,
);

/**
 * Whether everything on display is a file, which is what the Grid view is
 * offered for.
 *
 * A requested type on the static list answers before any types load. Types
 * outside it — subtypes such as `spreadsheetFile` — fall back to the loaded
 * ones.
 *
 * Normalised to a boolean so a falsy answer never changes identity between
 * renders: the caller keys a view-switching effect on it.
 */
export const displaysFilesOnly = ({
  closedMultiEntityTypes,
  entityTypeBaseUrl,
  entityTypeId,
  isSpecialEntityTypeLookup,
}: {
  closedMultiEntityTypes: ClosedMultiEntityType[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  isSpecialEntityTypeLookup: Record<
    VersionedUrl,
    SpecialEntityTypeRecord
  > | null;
}): boolean => {
  if (entityTypeId && allFileEntityTypeIds.includes(entityTypeId)) {
    return true;
  }

  if (
    entityTypeBaseUrl &&
    allFileEntityTypeBaseUrl.includes(entityTypeBaseUrl)
  ) {
    return true;
  }

  // No types loaded is ignorance, not an answer — reporting `true` for an empty
  // list would send an unread page to the Grid.
  if (closedMultiEntityTypes.length === 0) {
    return false;
  }

  return closedMultiEntityTypes.every(({ allOf }) =>
    allOf.some(({ $id }) => isSpecialEntityTypeLookup?.[$id]?.isFile),
  );
};
