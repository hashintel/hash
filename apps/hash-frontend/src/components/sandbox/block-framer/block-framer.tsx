import type { FunctionComponent , useCallback, useEffect, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import type {
  GraphEmbedderMessageCallbacks,
  JsonObject,
} from "@blockprotocol/graph";

import { memoizeFetchFunction } from "../../../lib/memoize";
import type { FetchEmbedCodeFn } from "../../block-loader/fetch-embed-code";
import { ResizingIFrame } from "../resizing-iframe/resizing-iframe";
import type { MessageFromBlockFramer, MessageFromFramedBlock } from "../types";

export type CrossFrameProxyProps = GraphEmbedderMessageCallbacks & {
  blockProperties: JsonObject;
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
  createEntity,
  getEmbedBlock,
  updateEntity,
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
     *
     * @see https://stackoverflow.com/a/417184
     * @todo Properly account for iframe origin in calc once known
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
    (properties: JsonObject) =>
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
    <
      T extends
        | GraphEmbedderMessageCallbacks[keyof GraphEmbedderMessageCallbacks]
        | typeof fetchSource
        | FetchEmbedCodeFn,
    >(
      fn: T | undefined,
      args: Parameters<T>,
      requestId: string,
    ) => {
      const responseMessage: MessageFromBlockFramer & { type: "response" } = {
        payload: {},
        requestId,
        type: "response",
      };

      if (!fn) {
        sendMessage({
          ...responseMessage,
          payload: { error: "Function not available." },
        });

        return;
      }

      // @ts-expect-error -- Args is a tuple but the compiler doesn't know. why?
      fn(...args)
        .then((response) => {
          sendMessage({ ...responseMessage, payload: { data: response } });
        })
        .catch((error) => {
          sendMessage({
            ...responseMessage,
            payload: { error: error.message },
          });
        });
    },
    [sendMessage],
  );

  useEffect(() => {
    const messageHandler = ({
      data,
      source,
    }: MessageEvent<MessageFromFramedBlock>) => {
      if (source !== frameRef.current?.contentWindow) {
        return;
      }
      /**
       * @todo Implement a permissions system whereby users are asked to grant
       *    blocks permissions to take actions. store these permissions somewhere.
       *    this naive passing through of requests provides no security at present.
       */
      switch (data.type) {
        case "queryEntities": {
          asyncCallAndResponse(queryEntities, data.payload, data.requestId);
          break;
        }
        case "queryEntityTypes": {
          asyncCallAndResponse(queryEntityTypes, data.payload, data.requestId);
          break;
        }
        case "createEntity": {
          asyncCallAndResponse(createEntity, data.payload, data.requestId);
          break;
        }
        case "updateEntity": {
          asyncCallAndResponse(updateEntity, data.payload, data.requestId);
          break;
        }
        case "getEmbedBlock": {
          asyncCallAndResponse(getEmbedBlock, data.payload, data.requestId);
          break;
        }
        case "fetchUrl": {
          asyncCallAndResponse(fetchSource, [data.payload], data.requestId);
          break;
        }
      }
    };

    window.addEventListener("message", messageHandler);

    return () => { window.removeEventListener("message", messageHandler); };
  }, [
    queryEntities,
    getEmbedBlock,
    asyncCallAndResponse,
    createEntity,
    updateEntity,
    queryEntityTypes,
  ]);

  const onLoad = useCallback(() => {
    onBlockLoaded();

    return !paramsIncludeProps ? sendBlockProperties(blockProperties) : null;
  }, [onBlockLoaded, blockProperties, paramsIncludeProps, sendBlockProperties]);

  return (
    <ResizingIFrame
      frameBorder={0}
      ref={frameRef}
      src={`${framePath}${iframeUrlSearchParams}`}
      style={{ minWidth: "100%", maxWidth: "1200px" }}
      title={"HASH Sandbox"}
      onLoad={onLoad}
    />
  );
};
