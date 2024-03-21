import type { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { useMemo } from "react";

import { useEntityTypesContextRequired } from "../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { FilePreviewSection } from "./entity-editor/file-preview-section";
import { LinkSection } from "./entity-editor/link-section";
import { LinksSection } from "./entity-editor/links-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";
import type { DraftLinkState } from "./shared/use-draft-link-state";

export interface EntityEditorProps extends DraftLinkState {
  isDirty: boolean;
  entitySubgraph: Subgraph<EntityRootType>;
  setEntity: (entity: Entity) => void;
  readonly: boolean;
  onEntityUpdated: (entity: Entity) => void;
}

export const EntityEditor = (props: EntityEditorProps) => {
  const { entitySubgraph } = props;

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const entity = useMemo(() => {
    const roots = getRoots(entitySubgraph);

    if (roots.length > 1) {
      /**
       * If this is thrown then the entitySubgraph is probably the result of a query for an entityId without a draftId,
       * where there is a live entity and one or more draft updates in the database.
       * Any query without an entityId should EXCLUDE entities with a draftId to ensure only the live version is returned.
       */
      throw new Error(
        `More than one root entity passed to entity editor, with ids: ${roots.map((root) => root.metadata.recordId.entityId).join(", ")}`,
      );
    }

    const [rootEntity] = roots;

    if (!rootEntity) {
      throw new Error("No root entity found in entity editor subgraph");
    }

    return rootEntity;
  }, [entitySubgraph]);

  const isLinkEntity = useMemo(
    () => isSpecialEntityTypeLookup?.[entity.metadata.entityTypeId]?.isLink,
    [entity, isSpecialEntityTypeLookup],
  );

  return (
    <EntityEditorContextProvider {...props}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 6.5 }}>
        {isLinkEntity ? <LinkSection /> : <TypesSection />}

        <FilePreviewSection />

        <PropertiesSection />

        {isLinkEntity ? null : <LinksSection />}

        {/* <PeersSection /> */}
      </Box>
    </EntityEditorContextProvider>
  );
};
