import { GlideGridOverlayPortal } from "../../../../components/GlideGlid/glide-grid-overlay-portal";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PeersSection } from "./entity-editor/peers-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";
import { SingleEntityRootedSubgraph } from "../../../../lib/subgraph";
import { Entity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

export interface EntityEditorProps {
  entityRootedSubgraph: SingleEntityRootedSubgraph | undefined;
  setEntity: (entity: Entity | undefined) => void;
}

export const EntityEditor = ({
  entityRootedSubgraph,
  setEntity,
}: EntityEditorProps) => {
  return (
    <EntityEditorContextProvider
      entityRootedSubgraph={entityRootedSubgraph}
      setEntity={setEntity}
    >
      <TypesSection />

      <PropertiesSection />

      <LinksSection />

      <PeersSection />

      <GlideGridOverlayPortal />
    </EntityEditorContextProvider>
  );
};
