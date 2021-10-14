import { useCallback, useEffect, useRef, VoidFunctionComponent } from "react";
import {
  BlockProtocolFunction,
  BlockProtocolProps,
  JSONObject,
} from "@hashintel/block-protocol";
import { encode } from "js-base64";
import { v4 as uuid } from "uuid";

import { ResizingIFrame } from "../ResizingIFrame/ResizingIFrame";
import { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";
import { memoizeFetchFunction } from "../../../lib/memoize";

export type CrossFrameProxyProps = BlockProtocolProps & {
  blockProperties: JSONObject;
  sourceUrl: string;
};

const fetchSource = memoizeFetchFunction((url) =>
  fetch(url).then((resp) => resp.text())
);

export const BlockFramer: VoidFunctionComponent<
  CrossFrameProxyProps & Record<string, any>
> = ({ sourceUrl, aggregate, create, update, blockProperties }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const b64Properties = encode(JSON.stringify(blockProperties));

  const sendMessage = (message: MessageFromBlockFramer, origin = "*") =>
    frameRef.current?.contentWindow?.postMessage(message, origin);

  useEffect(() => {
    sendMessage({
      type: "newData",
      payload: blockProperties,
      requestId: uuid(),
    });
  }, [blockProperties]);

  /**
   * Call an async function and return the results to the framed block.
   */
  const asyncCallAndResponse = useCallback(
    <T extends BlockProtocolFunction | typeof fetchSource>(
      fn: T | undefined,
      args: Parameters<T>[0],
      requestId: string
    ) => {
      const responseMsg: MessageFromBlockFramer & { type: "response" } = {
        payload: {},
        requestId,
        type: "response",
      };

      if (!fn) {
        sendMessage({
          ...responseMsg,
          payload: { error: "Function not available." },
        });
        return;
      }

      fn(args as FixMeLater)
        .then((response) => {
          sendMessage({ ...responseMsg, payload: { data: response || "ok" } });
        })
        .catch((error) => {
          sendMessage({
            ...responseMsg,
            payload: { error: error.message },
          });
        });
    },
    []
  );

  useEffect(() => {
    const msgHandler = ({
      data,
      source,
    }: MessageEvent<MessageFromFramedBlock>) => {
      if (source !== frameRef.current?.contentWindow) {
        return;
      }
      /**
       * @todo implement a permissions system whereby users are asked to grant
       *    blocks permissions to take actions. store these permissions somewhere.
       *    this naive passing through of requests provides no security at present.
       */
      switch (data.type) {
        case "aggregate":
          asyncCallAndResponse(aggregate, data.payload, data.requestId);
          break;
        case "create":
          asyncCallAndResponse(create, data.payload, data.requestId);
          break;
        case "update":
          asyncCallAndResponse(update, data.payload, data.requestId);
          break;
        case "fetchUrl":
          asyncCallAndResponse(fetchSource, data.payload, data.requestId);
          break;
      }
    };

    window.addEventListener("message", msgHandler);

    return () => window.removeEventListener("message", msgHandler);
  }, [aggregate, asyncCallAndResponse, create, update]);

  return (
    <ResizingIFrame
      frameBorder={0}
      ref={frameRef}
      src={`/_next/static/sandbox.html?properties=${b64Properties}&sourceUrl=${sourceUrl}`}
      style={{ minWidth: "100%", maxWidth: "1200px" }}
      title="HASH Sandbox"
    />
  );
};
