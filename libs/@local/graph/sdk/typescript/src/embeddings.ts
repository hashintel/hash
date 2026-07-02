import { v4 as uuidv4 } from "uuid";

import type { Embedding } from "@local/hash-graph-client";
import type { Client } from "@temporalio/client";

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

// TODO(BE-622): Move to the graph
export const calculateEmbedding = async (
  semanticString: string,
  temporalClient: Client,
): Promise<Embedding> => {
  const { embeddings } = await temporalClient.workflow.execute<
    (params: CreateEmbeddingsParams) => Promise<CreateEmbeddingsReturn>
  >("createEmbeddings", {
    taskQueue: "ai",
    args: [
      {
        input: [semanticString],
      },
    ],
    workflowId: uuidv4(),
  });

  if (embeddings.length === 0) {
    throw new Error("No embeddings returned");
  }

  return embeddings[0]!;
};
