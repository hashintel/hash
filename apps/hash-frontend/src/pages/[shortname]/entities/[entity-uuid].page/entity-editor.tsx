import { Entity, Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { Box } from "@mui/material";

import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";
import { DraftLinkState } from "./shared/use-draft-link-state";

export interface EntityEditorProps extends DraftLinkState {
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
  setEntity: (entity: Entity) => void;
  refetch: () => Promise<void>;
}

export const EntityEditor = (props: EntityEditorProps) => {
  return (
    <EntityEditorContextProvider {...props}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 6.5 }}>
        <TypesSection />

        <PropertiesSection />

        <LinksSection />

        {/* <PeersSection /> */}
      </Box>
    </EntityEditorContextProvider>
  );
};
