import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { SpecialEntityTypeRecord } from "../../../../shared/entity-types-context/shared/context-types";
import type { ClosedMultiEntityType } from "@blockprotocol/graph";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

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
) as BaseUrl[];

/**
 * Whether everything on display is a file, which is what the Grid view renders.
 *
 * A requested type that is on the static list answers without any data, so the
 * Grid can be picked on the first render. Types outside it — subtypes such as
 * `spreadsheetFile` — fall back to the loaded types.
 *
 * The result is a boolean rather than the operands themselves: the caller keys
 * a view-switching effect on it, and a falsy result that changes shape (`0` for
 * an empty type list where a mismatch gave `false`) would re-run that effect and
 * pull the view back to Table.
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
