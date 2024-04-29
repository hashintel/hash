import dedent from "dedent";

import type { ParsedLlmToolCall } from "../../../shared/get-llm-response/types";
import type { CompletedToolCall } from "../types";
import { indexPdfFile } from "./llama-index/index-pdf-file";
import type { ToolCallArguments } from "./tool-definitions";

export const handleQueryPdfToolCall = async (params: {
  toolCall: ParsedLlmToolCall<"queryPdf">;
}): Promise<CompletedToolCall<"queryPdf">> => {
  const { toolCall } = params;
  const { query, fileUrl } = toolCall.input as ToolCallArguments["queryPdf"];

  /**
   * Step 1: Ensure the file at the provided URL is a PDF file
   * before fetching it, via a HEAD request.
   */
  const fileUrlHeadFetch = await fetch(fileUrl, { method: "HEAD" });

  if (!fileUrlHeadFetch.ok) {
    return {
      ...toolCall,
      output: `Failed to fetch the file at the provided URL: ${fileUrl}`,
      isError: true,
    };
  }

  const contentType = fileUrlHeadFetch.headers.get("Content-Type");

  if (contentType && !contentType.includes("application/pdf")) {
    return {
      ...toolCall,
      output: dedent(`
      The file at the provided URL is not a PDF file.
      Detected Content-Type: ${contentType}
    `),
      isError: true,
    };
  }

  /**
   * Step 2: Index the PDF file at the provided URL, and query it
   * with the provided query.
   */

  const { vectorStoreIndex } = await indexPdfFile({ fileUrl });

  const queryEngine = vectorStoreIndex.asQueryEngine();

  const { response, sourceNodes } = await queryEngine.query({
    query,
  });

  return {
    ...toolCall,
    output: dedent(`
    Response: ${response}
    Source Nodes: ${JSON.stringify(sourceNodes)}
  `),
  };
};
