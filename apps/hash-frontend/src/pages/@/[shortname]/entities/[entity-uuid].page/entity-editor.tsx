import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type {
  BaseUrl,
  ClosedMultiEntityType,
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import type { RefObject } from "react";
import { useMemo } from "react";

import type { MinimalEntityValidationReport } from "../../../../shared/use-validate-entity";
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
  closedMultiEntityType: ClosedMultiEntityType;
  closedMultiEntityTypesDefinitions: ClosedMultiEntityTypesDefinitions;
  closedMultiEntityTypesMap: ClosedMultiEntityTypesRootMap | null;
  customEntityLinksColumns?: CustomEntityLinksColumn[];
  defaultOutgoingLinkFilters?: Partial<OutgoingLinksFilterValues>;
  isDirty: boolean;
  entityLabel: string;
  entitySubgraph: Subgraph<EntityRootType>;
  handleTypesChange: (args: {
    entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
    removedPropertiesBaseUrls: BaseUrl[];
    removedLinkTypesBaseUrls: BaseUrl[];
  }) => Promise<void>;
  onEntityClick: (entityId: EntityId) => void;
  onTypeClick: (
    type: "dataType" | "entityType",
    versionedUrl: VersionedUrl,
  ) => void;
  setEntity: (entity: Entity) => void;
  readonly: boolean;
  onEntityUpdated: ((entity: Entity) => void) | null;
  /**
   * If the editor is loaded inside a slide which is contained in a container other than the body,
   * the ref to the container. Used to correctly position popups within the editor.
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
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

  const tab = useEntityEditorTab();

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
