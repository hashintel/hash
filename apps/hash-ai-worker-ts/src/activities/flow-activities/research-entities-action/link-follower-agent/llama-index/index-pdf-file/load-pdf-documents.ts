import { Document } from "llamaindex";
import officeParser from "officeparser";

/**
 * Parses a PDF into one llamaindex {@link Document} per page.
 */
export const loadPdfDocuments = async (
  filePath: string,
): Promise<Document[]> => {
  const ast = await officeParser.parseOffice(filePath);

  const totalPages = ast.metadata.pages ?? ast.content.length;

  return ast.content.flatMap((node) =>
    node.type === "page" && node.metadata && "pageNumber" in node.metadata
      ? [
          new Document({
            text: node.text ?? "",
            metadata: {
              page_number: node.metadata.pageNumber,
              total_pages: totalPages,
            },
          }),
        ]
      : [],
  );
};
