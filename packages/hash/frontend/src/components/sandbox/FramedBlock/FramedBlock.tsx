import { useEffect, useState, VoidFunctionComponent } from "react";
import {
  BlockProtocolAggregateFn,
  BlockProtocolCreateFn,
  BlockProtocolUpdateFn,
  JSONObject,
} from "@hashintel/block-protocol";

import { sendMessage, settlePromiseFromResponse } from "./util";
import { MessageFromBlockFramer } from "../types";
import {
  BlockLoadingIndicator,
  RemoteBlock,
} from "../../RemoteBlock/RemoteBlock";

import "iframe-resizer/js/iframeResizer.contentWindow";
import { FetchEmbedCodeFn } from "../../BlockLoader/fetchEmbedCode";

const params = new URL(window.location.href).searchParams;

export const FramedBlock: VoidFunctionComponent = () => {
  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties ? JSON.parse(properties) : undefined;

  const [blockProperties, setBlockProperties] = useState<
    JSONObject | undefined
  >(initialData);

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

  if (!blockProperties) {
    /**
     * if we have _no_ properties object then they are being sent by message instead.
     * we can't load the block until we have them, as it might crash without.
     * */
    return <BlockLoadingIndicator />;
  }

  /**
   * @todo set loading / error states based on promise status and pass into block.
   *    in order to provide aggregateLoading, aggregateError, etc
   */
  const aggregate: BlockProtocolAggregateFn = (...payload) =>
    sendMessage({
      payload,
      type: "aggregate",
    });

  const create: BlockProtocolCreateFn = (...payload) =>
    sendMessage({
      payload,
      type: "aggregate",
    });

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
