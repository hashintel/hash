import { GlideGridOverlayPortal } from "../../../components/GlideGlid/glide-grid-overlay-portal";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityEditorContextProvider } from "./[entity-id].page/entity-editor-context";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";
import { LinksSection } from "./[entity-id].page/links-section";
import { PeersSection } from "./[entity-id].page/peers-section";
import { PropertiesSection } from "./[entity-id].page/properties-section";
import { TypesSection } from "./[entity-id].page/types-section";

const Page: NextPageWithLayout = () => {
  return (
    <EntityEditorContextProvider>
      <EntityPageWrapper>
        <TypesSection />

        <PropertiesSection />

        <LinksSection />

        <PeersSection />
      </EntityPageWrapper>

      <GlideGridOverlayPortal />
    </EntityEditorContextProvider>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
