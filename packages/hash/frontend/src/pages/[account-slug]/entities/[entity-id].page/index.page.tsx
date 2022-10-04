import { Typography } from "@mui/material";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntitySection } from "./entity-section";
import { PropertiesSection } from "./properties-section";
import { LinksSection } from "./links-section";
import { PeersSection } from "./peers-section";

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
