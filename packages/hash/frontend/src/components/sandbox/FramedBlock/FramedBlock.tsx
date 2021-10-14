import { useEffect, useState, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
  JSONObject,
} from "@hashintel/block-protocol";
import { decode } from "js-base64";

import { sendMessage, settlePromiseFromResponse } from "./util";
import { MessageFromBlockFramer } from "../types";
import { RemoteBlock } from "../../RemoteBlock/RemoteBlock";

import "iframe-resizer/js/iframeResizer.contentWindow";
import { FetchEmbedCodeFn } from "../../BlockLoader/fetchEmbedCode";

export const FramedBlock: VoidFunctionComponent = () => {
  const params = new URL(window.location.href).searchParams;

  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties
    ? JSON.parse(decodeURIComponent(decode(properties)))
    : {};

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
   * @todo set loading / error states based on promise status and pass into block.
   *    in order to provide aggregateLoading, aggregateError, etc
   */
  const aggregate: BlockProtocolAggregateFn = (...payload) =>
    sendMessage({ payload, type: "aggregate" });

  const create: BlockProtocolCreateFn = (...payload) =>
    sendMessage({ payload, type: "aggregate" });

  const update: BlockProtocolUpdateFn = (...payload) =>
    sendMessage({ payload, type: "update" });

  const getEmbedBlock: FetchEmbedCodeFn = (...payload) =>
    sendMessage({ payload, type: "getEmbedBlock" });

  const props = {
    ...blockProperties,
    aggregate,
    create,
    getEmbedBlock,
    update,
  };

  if (sourceUrl.endsWith(".html")) {
    /**
     * One answer to 'how do you make functions and properties available to HTML blocks?'
     * @todo see how this works with HTML blocks of any complexity
     */
    Object.assign(window, props);
  }

  return <RemoteBlock {...props} crossFrame sourceUrl={sourceUrl} />;
};
