import { NextSeo } from "next-seo";

import { getLayoutWithSidebar } from "../shared/layout";
import FlowsPage from "./flows.page";
import GoalsPage from "./goals.page";
import { useEnabledFeatureFlags } from "./shared/use-enabled-feature-flags";

import type { NextPageWithLayout } from "../shared/layout";

const ProcessesPage: NextPageWithLayout = () => {
  const { ai } = useEnabledFeatureFlags();

  return (
    <>
      <NextSeo title="Processes" />
      {ai ? <GoalsPage /> : <FlowsPage />}
    </>
  );
};

ProcessesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessesPage;
