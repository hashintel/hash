import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityPageWrapper } from "./[entity-id].page/entity-page-wrapper";
import { LinksSection } from "./[entity-id].page/links-section";
import { PeersSection } from "./[entity-id].page/peers-section";
import { PropertiesSection } from "./[entity-id].page/properties-section";
import { TypesSection } from "./[entity-id].page/types-section";

const Page: NextPageWithLayout = () => {
  return (
    <EntityPageWrapper>
      <TypesSection />

      <PropertiesSection />

      <LinksSection />

      <PeersSection />
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
