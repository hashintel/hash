import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";
import { Box } from "@mui/material";
import type { RefObject } from "react";
import { useMemo } from "react";

import type { MinimalEntityValidationReport } from "../use-validate-entity";
import { ClaimsSection } from "./entity-editor/claims-section";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { FilePreviewSection } from "./entity-editor/file-preview-section";
import { HistorySection } from "./entity-editor/history-section";
import { LinkSection } from "./entity-editor/link-section";
import { LinksSection } from "./entity-editor/links-section";
import type { OutgoingLinksFilterValues } from "./entity-editor/links-section/outgoing-links-section/readonly-outgoing-links-table";
import { PropertiesSection } from "./entity-editor/properties-section";
import type { CustomEntityLinksColumn } from "./entity-editor/shared/types";
import { TypesSection } from "./entity-editor/types-section";
import { useEntityEditorTab } from "./shared/entity-editor-tabs";
import type { DraftLinkState } from "./shared/use-draft-link-state";

export type { CustomEntityLinksColumn };

export interface EntityEditorProps extends DraftLinkState {
  /**
   * The ClosedMultiEntityType of the entity being edited
   */
  closedMultiEntityType: ClosedMultiEntityType;
  /**
   * The additional types relied on by the ClosedMultiEntityType of the entity being edited:
   * property types, link types, and entity types for both links and their destinations.
   */
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions;
  /**
   * Custom columns to display in the readonly incoming and outgoing links table (e.g. aggregations or other computed values)
   */
  customEntityLinksColumns?: CustomEntityLinksColumn[];
  /**
   * The default filters to apply to the outgoing links table (example use case: in the graph visualizer, filter down to relevant edges)
   */
  defaultOutgoingLinkFilters?: Partial<OutgoingLinksFilterValues>;
  /**
   * Whether the entity is dirty (has unsaved changes)
   */
  isDirty: boolean;
  /**
   * The label of the entity being edited
   */
  entityLabel: string;
  /**
   * The subgraph of the entity being edited – used to retrieve linked entities from (NOT types, which are taken from XType fields)
   */
  entitySubgraph: Subgraph<EntityRootType<HashEntity>>;
  /**
   * A function to call when the types of the entity are changed
   */
  handleTypesChange: (args: {
    entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
    removedPropertiesBaseUrls: BaseUrl[];
    removedLinkTypesBaseUrls: BaseUrl[];
  }) => Promise<void>;
  /**
   * A map containing types for entities that are linked to or from the entity being edited, and for the links themselves.
   * Used to generate labels for those entities in the editor. The type for the entity itself is taken from closedMultiEntityType.
   */
  linkAndDestinationEntitiesClosedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  /**
   * A function to call when an entity is clicked (e.g. a linked entity)
   */
  onEntityClick: (entityId: EntityId) => void;
  /**
   * A function to call when a type is clicked (e.g. an entity's type, or a data type for a property)
   */
  onTypeClick: (
    type: "dataType" | "entityType",
    versionedUrl: VersionedUrl,
  ) => void;
  /**
   * A function to call when the entity is updated
   */
  setEntity: (entity: HashEntity) => void;
  /**
   * Whether the editor is readonly
   */
  readonly: boolean;
  /**
   * A function to call when the entity is updated
   */
  onEntityUpdated: ((entity: HashEntity) => void) | null;
  /**
   * If the editor is loaded inside a slide which is contained in a container other than the body,
   * the ref to the container. Used to correctly position popups within the editor.
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
  /**
   * The validation report for the entity being edited (used to highlight validation errors in the editor)
   */
  validationReport: MinimalEntityValidationReport | null;
}

export const EntityEditor = (props: EntityEditorProps) => {
  const { entitySubgraph } = props;

  const entity = useMemo(() => {
    const roots = getRoots(entitySubgraph);

    if (roots.length > 1) {
      /**
       * If this is thrown then the entitySubgraph is probably the result of a query for an entityId without a draftId,
       * where there is a live entity and one or more draft updates in the database.
       * Any query without an entityId should EXCLUDE entities with a draftId to ensure only the live version is
       * returned.
       */
      throw new Error(
        `More than one root entity passed to entity editor, with ids: ${roots
          .map((root) => root.metadata.recordId.entityId)
          .join(", ")}`,
      );
    }

    const [rootEntity] = roots;

    if (!rootEntity) {
      throw new Error("No root entity found in entity editor subgraph");
    }

    return rootEntity;
  }, [entitySubgraph]);

  /**
   * @todo when we allow starting an empty link entity and choosing the source/target later, this will need to be updated
   *    to use isSpecialEntityTypeLookup instead
   */
  const isLinkEntity = !!entity.linkData;

  const { tab } = useEntityEditorTab();

  return (
    <EntityEditorContextProvider {...props}>
      {tab === "history" ? (
        <HistorySection entityId={entity.metadata.recordId.entityId} />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 6.5 }}>
          {isLinkEntity ? <LinkSection /> : <TypesSection />}

          <FilePreviewSection />

          <PropertiesSection />

          <LinksSection isLinkEntity={isLinkEntity} />

          <ClaimsSection />

          {/* <PeersSection /> */}
        </Box>
      )}
    </EntityEditorContextProvider>
  );
};
