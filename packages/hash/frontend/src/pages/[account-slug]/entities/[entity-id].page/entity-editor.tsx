import { GlideGridOverlayPortal } from "../../../../components/GlideGlid/glide-grid-overlay-portal";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { LinksSection } from "./entity-editor/links-section";
import { PeersSection } from "./entity-editor/peers-section";
import { PropertiesSection } from "./entity-editor/properties-section";
import { TypesSection } from "./entity-editor/types-section";

export interface EntityEditorProps {
  entity: EntityResponse | undefined;
  setEntity: (entity: EntityResponse | undefined) => void;
}

export const EntityEditor = ({ entity, setEntity }: EntityEditorProps) => {
  return (
    <EntityEditorContextProvider entity={entity} setEntity={setEntity}>
      <TypesSection />

      <PropertiesSection />

      <LinksSection />

      <PeersSection />

      <GlideGridOverlayPortal />
    </EntityEditorContextProvider>
  );
};
