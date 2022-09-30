import { Typography } from "@mui/material";
import { getPlainLayout, NextPageWithLayout } from "../../../../shared/layout";
import { EntityPageWrapper } from "./shared/entity-page-wrapper";

const Page: NextPageWithLayout = () => {
  return (
    <EntityPageWrapper>
      <Typography>Context</Typography>
    </EntityPageWrapper>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
