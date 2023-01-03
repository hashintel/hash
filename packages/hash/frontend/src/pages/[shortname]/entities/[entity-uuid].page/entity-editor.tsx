import { Entity, Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";

import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PeersSection } from "./entity-editor/peers-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";

export interface EntityEditorProps {
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
  setEntity: (entity: Entity) => void;
  refetch: () => Promise<void>;
}

export const EntityEditor = ({
  entitySubgraph,
  setEntity,
  refetch,
  hideLinksSection,
}: EntityEditorProps & { hideLinksSection: boolean }) => {
  return (
    <EntityEditorContextProvider
      entitySubgraph={entitySubgraph}
      setEntity={setEntity}
      refetch={refetch}
    >
      <TypesSection />

      <PropertiesSection />

      {!hideLinksSection && <LinksSection />}

      <PeersSection />
    </EntityEditorContextProvider>
  );
};
