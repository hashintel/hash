import { Typography } from "@mui/material";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { EntityPageWrapper } from "./shared/entity-page-wrapper";
import { EntitySection } from "./shared/entity-section";
import { PropertiesSection } from "./overview.page/properties-section";
import { LinksSection } from "./overview.page/links-section";
import { PeersSection } from "./overview.page/peers-section";

const Page: NextPageWithLayout = () => {
  return (
    <EntityPageWrapper>
      <EntitySection title="Types">
        <Typography>Here are the Types</Typography>
      </EntitySection>

      <PropertiesSection />

      <LinksSection />

      <PeersSection />
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
