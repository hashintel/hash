import type { Filter } from "@local/hash-graph-client";
import type {
  CreateEmbeddingsParams,
  CreateEmbeddingsReturn,
} from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Client } from "@temporalio/client";

import { genId } from "../../util";

export const rewriteSemanticFilter = async (
  filter?: Filter,
  temporalClient?: Client,
) => {
  if (!filter) {
    return;
  }

  /**
   * Convert any strings provided under a 'cosineDistance' filter into embeddings.
   */
  for (const [filterName, expression] of Object.entries(filter)) {
    if (filterName === "cosineDistance") {
      if (
        Array.isArray(expression) &&
        expression[1] &&
        "parameter" in expression[1] &&
        typeof expression[1].parameter === "string"
      ) {
        if (!temporalClient) {
          throw new Error(
            "Cannot query cosine distance without temporal client",
          );
        }

        const stringInputValue = expression[1].parameter;
        const { embeddings } = await temporalClient.workflow.execute<
          (params: CreateEmbeddingsParams) => Promise<CreateEmbeddingsReturn>
        >("createEmbeddings", {
          taskQueue: "ai",
          args: [
            {
              input: [stringInputValue],
            },
          ],
          workflowId: genId(),
        });
        expression[1].parameter = embeddings[0];
      }
    }

    /**
     * The cosineDistance filter may be nested inside an 'any' filter or 'all', so we need to recurse
     */
    if (Array.isArray(expression)) {
      await Promise.all(
        expression.map((innerFilter) =>
          rewriteSemanticFilter(innerFilter, temporalClient),
        ),
      );
    }
  }
};
