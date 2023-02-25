import {
  BlockProtocolFunction,
  BlockProtocolFunctions,
  JSONObject,
} from "blockprotocol";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { v4 as uuid } from "uuid";

import { memoizeFetchFunction } from "../../../lib/memoize";
import { FetchEmbedCodeFn } from "../../block-loader/fetch-embed-code";
import { ResizingIFrame } from "../resizing-iframe/resizing-iframe";
import { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";

export type CrossFrameProxyProps = BlockProtocolFunctions & {
  blockProperties: JSONObject;
  getEmbedBlock?: FetchEmbedCodeFn;
  sourceUrl: string;
  onBlockLoaded: () => void;
};

const fetchSource = memoizeFetchFunction((url) =>
  fetch(url).then((resp) => resp.text()),
);

export const BlockFramer: FunctionComponent<CrossFrameProxyProps> = ({
  sourceUrl,
  queryEntities,
  queryEntityTypes,
  createEntities,
  getEmbedBlock,
  updateEntities,
  blockProperties,
  onBlockLoaded,
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const framePath = `/_next/static/sandbox.html?`;

  const { iframeUrlSearchParams, paramsIncludeProps } = useMemo(() => {
    const propertiesWithParams = new URLSearchParams({
      properties: JSON.stringify(blockProperties),
      sourceUrl,
    }).toString();
    /**
     * Check if we'll fall foul of CDN 8kB URL limits.
     * We are not supporting IE/early Edge.
     * @see https://stackoverflow.com/a/417184
     * @todo properly account for iframe origin in calc once known
     *    how will users set the iframe origin? NEXT_PUBLIC_ENV?
     */
    if ((propertiesWithParams + sourceUrl).length < 7900) {
      return {
        iframeUrlSearchParams: propertiesWithParams,
        paramsIncludeProps: true,
      };
    }
    return {
      iframeUrlSearchParams: new URLSearchParams({ sourceUrl }).toString(),
      paramsIncludeProps: false,
    };
  }, [blockProperties, sourceUrl]);

  const sendMessage = useCallback(
    (message: MessageFromBlockFramer, origin = "*") =>
      frameRef.current?.contentWindow?.postMessage(message, origin),
    [],
  );

  const sendBlockProperties = useCallback(
    (properties: JSONObject) =>
      sendMessage({
        type: "newData",
        payload: properties,
        requestId: uuid(),
      }),
    [sendMessage],
  );

  useEffect(() => {
    sendBlockProperties(blockProperties);
  }, [blockProperties, sendBlockProperties]);

  /**
   * Call an async function and return the results to the framed block.
   */
  const asyncCallAndResponse = useCallback(
    <T extends BlockProtocolFunction | typeof fetchSource | FetchEmbedCodeFn>(
      fn: T | undefined,
      args: Parameters<T>,
      requestId: string,
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

      // @ts-expect-error -- Args is a tuple but the compiler doesn't know. why?
      fn(...args)
        .then((response) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
          sendMessage({ ...responseMsg, payload: { data: response ?? "ok" } });
        })
        .catch((error) => {
          sendMessage({
            ...responseMsg,
            payload: { error: error.message },
          });
        });
    },
    [sendMessage],
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
        case "queryEntities":
          asyncCallAndResponse(queryEntities, data.payload, data.requestId);
          break;
        case "queryEntityTypes":
          asyncCallAndResponse(queryEntityTypes, data.payload, data.requestId);
          break;
        case "createEntities":
          asyncCallAndResponse(createEntities, data.payload, data.requestId);
          break;
        case "updateEntities":
          asyncCallAndResponse(updateEntities, data.payload, data.requestId);
          break;
        case "getEmbedBlock":
          asyncCallAndResponse(getEmbedBlock, data.payload, data.requestId);
          break;
        case "fetchUrl":
          asyncCallAndResponse(fetchSource, [data.payload], data.requestId);
          break;
      }
    };

    window.addEventListener("message", msgHandler);

    return () => window.removeEventListener("message", msgHandler);
  }, [
    queryEntities,
    getEmbedBlock,
    asyncCallAndResponse,
    createEntities,
    updateEntities,
    queryEntityTypes,
  ]);

  const onLoad = useCallback(() => {
    onBlockLoaded();
    return !paramsIncludeProps ? sendBlockProperties(blockProperties) : null;
  }, [onBlockLoaded, blockProperties, paramsIncludeProps, sendBlockProperties]);

  return (
    <ResizingIFrame
      frameBorder={0}
      onLoad={onLoad}
      ref={frameRef}
      src={`${framePath}${iframeUrlSearchParams}`}
      style={{ minWidth: "100%", maxWidth: "1200px" }}
      title="HASH Sandbox"
    />
  );
};
