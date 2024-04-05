import { NextSeo } from "next-seo";

import { BoltLightIcon } from "../shared/icons/bolt-light-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { ResearchTaskFlow } from "./ai.page/research-task-flow";
import { TopContextBar } from "./shared/top-context-bar";
import { FlowActions } from "./ai.page/flow-actions";
import { Container } from "@mui/material";

const AiPage: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="AI" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "AI",
            id: "ai",
            icon: <BoltLightIcon />,
            href: "/ai",
          },
          {
            title: "Worker",
            id: "worker",
          },
        ]}
      />
      <Container sx={{ pb: 8 }}>
        <ResearchTaskFlow />
        <FlowActions />
      </Container>
    </>
  );
};

AiPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default AiPage;
