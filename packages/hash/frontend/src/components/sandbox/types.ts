import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
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
