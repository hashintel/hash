import { NextSeo } from "next-seo";

import { BoltLightIcon } from "../shared/icons/bolt-light-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { AiWorkerPageContent } from "./ai.page/ai-worker-page-content";
import { TopContextBar } from "./shared/top-context-bar";

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
      <AiWorkerPageContent />
    </>
  );
};

AiPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default AiPage;
