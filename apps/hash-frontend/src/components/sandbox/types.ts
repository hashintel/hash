import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntityTypesFunction,
  BlockProtocolCreateEntitiesFunction,
  BlockProtocolUpdateEntitiesFunction,
  JSONObject,
} from "blockprotocol";

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
      type: "updateEntities";
      payload: Parameters<BlockProtocolUpdateEntitiesFunction>;
    }
  | {
      type: "createEntities";
      payload: Parameters<BlockProtocolCreateEntitiesFunction>;
    }
  | {
      type: "queryEntities";
      payload: Parameters<BlockProtocolAggregateEntitiesFunction>;
    }
  | {
      type: "queryEntityTypes";
      payload: Parameters<BlockProtocolAggregateEntityTypesFunction>;
    }
);

export type MessageFromBlockFramer = {
  requestId: string;
} & (
  | {
      type: "newData";
      payload: JSONObject;
    }
  | {
      type: "response";
      payload: {
        data?: any;
        error?: string;
      };
    }
);
