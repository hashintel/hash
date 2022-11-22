import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PeersSection } from "./entity-editor/peers-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";
import { RootEntityAndSubgraph } from "../../../../lib/subgraph";
import { Entity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

export interface EntityEditorProps {
  rootEntityAndSubgraph: RootEntityAndSubgraph | undefined;
  setEntity: (entity: Entity | undefined) => void;
}

export const EntityEditor = ({
  rootEntityAndSubgraph,
  setEntity,
}: EntityEditorProps) => {
  return (
    <EntityEditorContextProvider
      rootEntityAndSubgraph={rootEntityAndSubgraph}
      setEntity={setEntity}
    >
      <TypesSection />

      <PropertiesSection />

      <LinksSection />

      <PeersSection />
    </EntityEditorContextProvider>
  );
};
