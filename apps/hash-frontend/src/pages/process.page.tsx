import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { ProcessEditorWrapper } from "./process.page/process-editor-wrapper";

const ProcessPage: NextPageWithLayout = () => {
  return <ProcessEditorWrapper />;
};

ProcessPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessPage;
