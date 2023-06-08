import {
  GraphEmbedderMessageCallbacks,
  JsonObject,
} from "@blockprotocol/graph/temporal";

import { FetchEmbedCodeFn } from "../block-loader/fetch-embed-code";

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
      payload: JsonObject;
    }
  | {
      type: "response";
      payload: {
        data?: any;
        error?: string;
      };
    }
);
