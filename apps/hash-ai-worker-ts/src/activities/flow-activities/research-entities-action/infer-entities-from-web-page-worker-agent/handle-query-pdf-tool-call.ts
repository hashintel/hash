import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { MetadataMode } from "llamaindex";

import { logger } from "../../../shared/activity-logger";
import type { ParsedLlmToolCall } from "../../../shared/get-llm-response/types";
import { logProgress } from "../../../shared/log-progress";
import { stringify } from "../../../shared/stringify";
import type { CompletedToolCall } from "../types";
import { filterAndRankTextChunksAgent } from "./filter-and-rank-text-chunks-agent";
import { indexPdfFile } from "./llama-index/index-pdf-file";
import type { ToolCallArguments } from "./tool-definitions";
import type { InferEntitiesFromWebPageWorkerAgentState } from "./types";

export const handleQueryPdfToolCall = async (params: {
  state: InferEntitiesFromWebPageWorkerAgentState;
  toolCall: ParsedLlmToolCall<"queryPdf">;
}): Promise<CompletedToolCall<"queryPdf">> => {
  const { toolCall, state } = params;
  const { description, fileUrl, exampleText } =
    toolCall.input as ToolCallArguments["queryPdf"];

  /**
   * @todo: are the prefixes necessary?
   */
  const query = dedent(`
    Description: ${description}
    Example text: ${exampleText}
  `);

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

  logProgress([
    {
      recordedAt: new Date().toISOString(),
      stepId: Context.current().info.activityId,
      type: "ViewedFile",
      fileUrl,
    },
  ]);

  /**
   * Step 2: Index the PDF file at the provided URL, and query it
   * with the provided query.
   */

  const { vectorStoreIndex } = await indexPdfFile({ fileUrl });

  const queryEngine = vectorStoreIndex.asQueryEngine({
    retriever: vectorStoreIndex.asRetriever({
      // Get the 15 most similar nodes
      similarityTopK: 15,
    }),
  });

  logger.debug(`Querying PDF file with query: ${query}`);

  const { sourceNodes } = await queryEngine.query({
    query,
  });

  const textChunks = sourceNodes?.map(({ node }) =>
    node.getContent(MetadataMode.NONE),
  );

  if (!textChunks || textChunks.length === 0) {
    /** @todo: is this even possible? */
    return {
      ...toolCall,
      output: "No relevant sections found in the PDF file based on your query.",
    };
  }

  logger.debug(
    `Vector DB query returned ${textChunks.length} chunks: ${stringify(textChunks)}`,
  );

  const filteredAndRankedTextChunksResponse =
    await filterAndRankTextChunksAgent({
      description,
      exampleText,
      textChunks,
    });

  if (filteredAndRankedTextChunksResponse.status !== "ok") {
    /** @todo: consider improving the error reporting of this */
    return {
      ...toolCall,
      output: "No relevant sections found in the PDF file based on your query.",
    };
  }

  const { orderedRelevantTextChunks } = filteredAndRankedTextChunksResponse;

  logger.debug(
    `Ordered relevant text chunks: ${stringify(orderedRelevantTextChunks)}`,
  );

  if (
    !state.filesQueried.some(
      ({ url: queriedFileUrl }) => queriedFileUrl === fileUrl,
    )
  ) {
    state.filesQueried.push({
      url: fileUrl,
      entityTypeId: systemEntityTypes.pdfDocument.entityTypeId,
    });
  }

  return {
    ...toolCall,
    output: dedent(`
    Here is a list of the most relevant sections of the PDF file, based on your query:
    ${orderedRelevantTextChunks.map((text, index) => `Relevant section ${index + 1}: ${text}`).join("\n")}
    --- END OF RELEVANT SECTIONS ---

    If the relevant sections include the information needed for the relevant entities,
      use the "inferEntitiesFromText" tool with the relevant text as input.

    If the relevant sections do not include the information needed for the relevant entities,
      that does not mean the information is not in the PDF file. You can try calling the
      "queryPdf" tool again with a different "description" of the information you need.
  `),
  };
};
