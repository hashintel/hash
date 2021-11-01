import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
  BlockProtocolAggregateEntityTypesFn,
  JSONObject,
} from "@hashintel/block-protocol";
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
      type: "update";
      payload: Parameters<BlockProtocolUpdateFn>;
    }
  | {
      type: "create";
      payload: Parameters<BlockProtocolCreateFn>;
    }
  | {
      type: "aggregate";
      payload: Parameters<BlockProtocolAggregateFn>;
    }
  | {
      type: "aggregateEntityTypes";
      payload: Parameters<BlockProtocolAggregateEntityTypesFn>;
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
