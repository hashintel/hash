import dedent from "dedent";
import { MetadataMode } from "llamaindex";

import { logger } from "../../../shared/activity-logger";
import type { ParsedLlmToolCall } from "../../../shared/get-llm-response/types";
import { stringify } from "../../../shared/stringify";
import type { CompletedToolCall } from "../types";
import { indexPdfFile } from "./llama-index/index-pdf-file";
import type { ToolCallArguments } from "./tool-definitions";

export const handleQueryPdfToolCall = async (params: {
  toolCall: ParsedLlmToolCall<"queryPdf">;
}): Promise<CompletedToolCall<"queryPdf">> => {
  const { toolCall } = params;
  const { description, fileUrl } =
    toolCall.input as ToolCallArguments["queryPdf"];

  const query = description;

  /**
   * Step 1: Ensure the file at the provided URL is a PDF file
   * before fetching it, via a HEAD request.
   */
  if (fileUrl.startsWith("/")) {
    return {
      ...toolCall,
      output: "You provided a relative URL, please provide an absolute URL.",
      isError: true,
    };
  }

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

  const queryEngine = vectorStoreIndex.asQueryEngine({
    retriever: vectorStoreIndex.asRetriever({
      // Get the 10 most similar nodes
      similarityTopK: 10,
    }),
  });

  logger.debug(`Querying PDF file with query: ${query}`);

  const { sourceNodes } = await queryEngine.query({
    query,
  });

  const nodeContents = sourceNodes?.map(({ node }) =>
    node.getContent(MetadataMode.NONE),
  );

  if (!nodeContents || nodeContents.length === 0) {
    /** @todo: is this even possible? */
    return {
      ...toolCall,
      output: "No relevant sections found in the PDF file based on your query.",
    };
  }

  logger.debug(`Query response: ${stringify(nodeContents)}`);

  return {
    ...toolCall,
    output: dedent(`
    Here is a list of the most relevant sections of the PDF file, based on your query:
    ${JSON.stringify(nodeContents)}
  `),
  };
};