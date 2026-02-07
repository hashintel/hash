import dynamic from "next/dynamic";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";

// Petrinaut uses Web Workers, Canvas, Monaco Editor, and the TypeScript compiler
// which all require browser APIs — must not be server-rendered.
const ProcessEditorWrapper = dynamic(
  () =>
    import("./process.page/process-editor-wrapper").then((mod) => ({
      default: mod.ProcessEditorWrapper,
    })),
  { ssr: false },
);

const ProcessPage: NextPageWithLayout = () => {
  return <ProcessEditorWrapper />;
};

ProcessPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default ProcessPage;
