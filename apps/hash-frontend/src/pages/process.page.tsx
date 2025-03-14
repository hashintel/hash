import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { ProcessEditor } from "./process.page/process-editor";

const ProcessPage: NextPageWithLayout = () => {
  return <ProcessEditor />;
};

ProcessPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessPage;
