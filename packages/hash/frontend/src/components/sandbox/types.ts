import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolCreateEntitiesFunction,
  BlockProtocolUpdateEntitiesFunction,
  BlockProtocolAggregateEntityTypesFunction,
  JSONObject,
} from "blockprotocol";
import { FetchEmbedCodeFn } from "../BlockLoader/fetchEmbedCode";

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
      type: "aggregateEntities";
      payload: Parameters<BlockProtocolAggregateEntitiesFunction>;
    }
  | {
      type: "aggregateEntityTypes";
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
