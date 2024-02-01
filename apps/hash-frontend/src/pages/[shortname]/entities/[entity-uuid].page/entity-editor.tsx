import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
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
import { DraftLinkState } from "./shared/use-draft-link-state";

export interface EntityEditorProps extends DraftLinkState {
  isDirty: boolean;
  entitySubgraph: Subgraph<EntityRootType>;
  setEntity: (entity: Entity) => void;
  replaceWithLatestDbVersion: () => Promise<void>;
  readonly: boolean;
}

export const EntityEditor = (props: EntityEditorProps) => {
  const { entitySubgraph } = props;

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const entity = useMemo(() => {
    const roots = getRoots(entitySubgraph);

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
