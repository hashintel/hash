import type { GraphEmbedderMessageCallbacks } from "@blockprotocol/graph";

import type { FetchEmbedCodeFn } from "../block-loader/fetch-embed-code";

export type MessageFromFramedBlock = {
  requestId: string;
} & (
  | {
      type: "fetchUrl";
      payload: string;
    }
  | {
      type: "getEmbedBlock";
      payload: Parameters<FetchEmbedCodeFn>;
    }
  | {
      type: "updateEntity";
      payload: Parameters<GraphEmbedderMessageCallbacks["updateEntity"]>;
    }
  | {
      type: "createEntity";
      payload: Parameters<GraphEmbedderMessageCallbacks["createEntity"]>;
    }
  | {
      type: "queryEntities";
      payload: Parameters<GraphEmbedderMessageCallbacks["queryEntities"]>;
    }
  | {
      type: "queryEntityTypes";
      payload: Parameters<GraphEmbedderMessageCallbacks["queryEntityTypes"]>;
    }
);

export type MessageFromBlockFramer = {
  requestId: string;
} & (
  | {
      type: "newData";
      payload: object;
    }
  | {
      type: "response";
      payload: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: any;
        error?: string;
      };
    }
);
