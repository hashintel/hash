import { PenRegularIcon } from "@hashintel/design-system";
import { breadcrumbsClasses, buttonClasses } from "@mui/material";
import { NextSeo } from "next-seo";

import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { DraftEntities } from "./drafts.page/draft-entities";
import { TopContextBar } from "./shared/top-context-bar";

const DraftsPage: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="Drafts" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Drafts",
            id: "drafts",
            icon: <PenRegularIcon />,
          },
        ]}
        sx={{
          background: "transparent",
          [`.${breadcrumbsClasses.ol} .${buttonClasses.root}`]: {
            background: "transparent",
            borderColor: "transparent",
          },
        }}
      />
      <DraftEntities />
    </>
  );
};

DraftsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default DraftsPage;
