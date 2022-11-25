import {
  EntityWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PeersSection } from "./entity-editor/peers-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";

export interface EntityEditorProps {
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]> | undefined;
  setEntity: (entity: EntityWithMetadata | undefined) => void;
}

export const EntityEditor = ({
  entitySubgraph,
  setEntity,
}: EntityEditorProps) => {
  return (
    <EntityEditorContextProvider
      entitySubgraph={entitySubgraph}
      setEntity={setEntity}
    >
      <TypesSection />

      <PropertiesSection />

      <LinksSection />

      <PeersSection />
    </EntityEditorContextProvider>
  );
};
