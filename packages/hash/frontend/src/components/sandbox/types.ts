import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
  JSONObject,
} from "@hashintel/block-protocol";

export type MessageFromFramedBlock = {
  requestId: string;
} & (
  | {
      type: "fetchUrl";
      payload: string;
    }
  | {
      type: "update";
      payload: Parameters<BlockProtocolUpdateFn>[0];
    }
  | {
      type: "create";
      payload: Parameters<BlockProtocolCreateFn>[0];
    }
  | {
      type: "aggregate";
      payload: Parameters<BlockProtocolAggregateFn>[0];
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
