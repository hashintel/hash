import type { Filter } from "@local/hash-graph-client";
import type { Client } from "@temporalio/client";
import { v4 as uuidv4 } from "uuid";

export type CreateEmbeddingsParams = {
  input: string[];
};

export type CreateEmbeddingsReturn = {
  embeddings: number[][];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export const rewriteSemanticFilter = async (
  filter: Filter,
  temporalClient?: Client,
) => {
  if ("cosineDistance" in filter) {
    if (
      filter.cosineDistance[1] &&
      "parameter" in filter.cosineDistance[1] &&
      typeof filter.cosineDistance[1].parameter === "string"
    ) {
      if (!temporalClient) {
        throw new Error("Cannot query cosine distance without temporal client");
      }

      const stringInputValue = filter.cosineDistance[1].parameter;
      const { embeddings } = await temporalClient.workflow.execute<
        (params: CreateEmbeddingsParams) => Promise<CreateEmbeddingsReturn>
      >("createEmbeddings", {
        taskQueue: "ai",
        args: [
          {
            input: [stringInputValue],
          },
        ],
        workflowId: uuidv4(),
      });

      // eslint-disable-next-line no-param-reassign
      filter.cosineDistance[1].parameter = embeddings[0];
    }
  } else if ("all" in filter) {
    await Promise.all(
      filter.all.map((innerFilter) =>
        rewriteSemanticFilter(innerFilter, temporalClient),
      ),
    );
  } else if ("any" in filter) {
    await Promise.all(
      filter.any.map((innerFilter) =>
        rewriteSemanticFilter(innerFilter, temporalClient),
      ),
    );
  } else if ("not" in filter) {
    await rewriteSemanticFilter(filter.not, temporalClient);
  }
};
