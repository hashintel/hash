import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { PdfViewer } from "./shared/pdf-preview";

const PdfPage: NextPageWithLayout = () => {
  return <PdfViewer url="https://core.ac.uk/download/pdf/82342688.pdf" />;
};

PdfPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default PdfPage;
