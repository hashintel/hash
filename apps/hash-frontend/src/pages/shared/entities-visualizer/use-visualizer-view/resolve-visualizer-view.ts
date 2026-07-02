/**
 * Pure logic for which view (Table / Grid / Graph) the visualizer displays
 * and which views it offers, separated from the hook for testability.
 */
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { VisualizerView } from "../../visualizer-views";
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

const allFileEntityTypeBaseUrls = allFileEntityTypeOntologyIds.map(
  ({ entityTypeBaseUrl }) => entityTypeBaseUrl,
);

/**
 * Whether every displayed entity is a file, in which case the Grid
 * (file-preview) view applies.
 *
 * To allow the Grid view to be chosen on FIRST render where possible, the
 * pinned `entityTypeId` / `entityTypeBaseUrl` are checked against a static
 * list of file types before any data is fetched; the fetched types are the
 * fallback for everything else.
 */
export const computeIsDisplayingFilesOnly = ({
  closedMultiEntityTypes,
  entityTypeBaseUrl,
  entityTypeId,
  isFileType,
}: {
  /** One closed multi-type per distinct type combination present in the results. */
  closedMultiEntityTypes: ClosedMultiEntityType[];
  entityTypeBaseUrl?: BaseUrl;
  entityTypeId?: VersionedUrl;
  isFileType: (entityTypeId: VersionedUrl) => boolean;
}): boolean =>
  Boolean(
    (entityTypeId && allFileEntityTypeIds.includes(entityTypeId)) ||
    (entityTypeBaseUrl &&
      allFileEntityTypeBaseUrls.includes(entityTypeBaseUrl)) ||
    (closedMultiEntityTypes.length &&
      closedMultiEntityTypes.every(({ allOf }) =>
        allOf.some(({ $id }) => isFileType($id)),
      )),
  );

/**
 * The Grid view is only offered when every displayed entity is a file. When
 * it is available it is also the default, so a file type's entities open in
 * Grid on first render. An explicit user selection always wins while it
 * remains offered; a Grid selection falls back to Table if the result set
 * stops being files-only.
 */
export const resolveVisualizerView = ({
  isDisplayingFilesOnly,
  selectedView,
}: {
  isDisplayingFilesOnly: boolean;
  /** The user's explicit choice, or `null` to derive the default from the data. */
  selectedView: VisualizerView | null;
}): {
  view: VisualizerView;
  viewOptions: VisualizerView[];
} => {
  const viewOptions: VisualizerView[] = isDisplayingFilesOnly
    ? ["Table", "Grid", "Graph"]
    : ["Table", "Graph"];

  const view =
    selectedView !== null && viewOptions.includes(selectedView)
      ? selectedView
      : isDisplayingFilesOnly
        ? "Grid"
        : "Table";

  return { view, viewOptions };
};
