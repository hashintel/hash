import { useEffect, useState, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
  JSONObject,
} from "@hashintel/block-protocol";
import { decode } from "js-base64";
import { v4 as uuid } from "uuid";

import { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";
import { RemoteBlock } from "../../RemoteBlock/RemoteBlock";

import "iframe-resizer/js/iframeResizer.contentWindow";

type PromiseFn = (val: any) => void;
const requestMap = new Map<string, { resolve: PromiseFn; reject: PromiseFn }>();

const sendMessage = (
  message: Omit<MessageFromFramedBlock, "requestId">,
  origin: string = "*"
): Promise<any> => {
  const requestId = uuid();
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
    requestMap.set(requestId, { resolve, reject });
  });
  // eslint-disable-next-line no-restricted-globals
  parent.window.postMessage({ ...message, requestId }, origin);
  return promise;
};

const settlePromiseFromResponse = (
  response: MessageFromBlockFramer & { type: "response" }
) => {
  const { payload, requestId } = response;
  const promise = requestMap.get(requestId);
  if (!promise) {
    throw new Error(`Request with id ${requestId} not found in request map`);
  }
  if (payload.data) {
    promise.resolve(payload.data);
  } else {
    promise.reject(
      new Error(payload.error || "Request could not be fulfilled.")
    );
  }
  requestMap.delete(requestId);
};

export const FramedBlock: VoidFunctionComponent = () => {
  const params = new URL(window.location.href).searchParams;

  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties ? JSON.parse(decode(properties)) : {};

  const [blockProperties, setBlockProperties] =
    useState<JSONObject>(initialData);

  useEffect(() => {
    const msgHandler = ({ data }: MessageEvent<MessageFromBlockFramer>) => {
      switch (data.type) {
        case "newData":
          setBlockProperties(data.payload);
          break;
        case "response":
          settlePromiseFromResponse(data);
          break;
      }
    };
    window.addEventListener("message", msgHandler);

    return () => window.removeEventListener("message", msgHandler);
  }, []);

  if (!sourceUrl) {
    throw new Error("sourceUrl URL param not provided");
  }

  /**
   * @todo set loading / error states based on promise status and pass into block
   *    in order to provide aggregateLoading, aggregateError, etc
   */
  const aggregate: BlockProtocolAggregateFn = (payload) =>
    sendMessage({ payload, type: "aggregate" });

  const create: BlockProtocolCreateFn = (payload) =>
    sendMessage({ payload, type: "aggregate" });

  const update: BlockProtocolUpdateFn = (payload) =>
    sendMessage({ payload, type: "update" });

  const fetchSourceFn = (url: string) =>
    sendMessage({ payload: url, type: "fetchUrl" });

  const props = {
    ...blockProperties,
    aggregate,
    create,
    update,
  };

  if (sourceUrl.endsWith(".html")) {
    /**
     * One answer to 'how do you make functions and properties available to HTML blocks?'
     * @todo see how this works with HTML blocks of any complexity
     */
    Object.assign(window, props);
  }

  return (
    <RemoteBlock
      {...props}
      fetchSourceFn={fetchSourceFn}
      sourceUrl={sourceUrl}
    />
  );
};
