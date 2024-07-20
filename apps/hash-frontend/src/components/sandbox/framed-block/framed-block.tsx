import "iframe-resizer/js/iframeResizer.contentWindow";
import type { FunctionComponent , useCallback, useEffect, useState } from "react";
import type {
  Entity,
  GraphEmbedderMessageCallbacks,
} from "@blockprotocol/graph";
import type * as Sentry from "@sentry/react";

import type { FetchEmbedCodeFn } from "../../block-loader/fetch-embed-code";
// import { ErrorBlock } from "../../error-block/error-block";
import {
  BlockLoadingIndicator,
  // RemoteBlock,
} from "../../remote-block/remote-block";
import type { MessageFromBlockFramer } from "../types";

import { sendMessage, settlePromiseFromResponse } from "./util";

const params = new URL(window.location.href).searchParams;

export const FramedBlock: FunctionComponent = () => {
  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties ? JSON.parse(properties) : undefined;

  const [blockProperties, setBlockProperties] = useState<Entity | undefined>(
    initialData,
  );

  const _beforeCapture = useCallback(
    (scope: Sentry.Scope) => {
      scope.setTag(
        "block",
        blockProperties?.metadata.recordId.entityId as string,
      );
    },
    [blockProperties],
  );

  useEffect(() => {
    const messageHandler = ({ data }: MessageEvent<MessageFromBlockFramer>) => {
      switch (data.type) {
        case "newData": {
          setBlockProperties(data.payload as Entity);
          break;
        }
        case "response": {
          settlePromiseFromResponse(data);
          break;
        }
      }
    };

    window.addEventListener("message", messageHandler);

    return () => { window.removeEventListener("message", messageHandler); };
  }, []);

  if (!sourceUrl) {
    throw new Error("sourceUrl URL param not provided");
  }

  if (!blockProperties) {
    /**
     * If we have _no_ properties object then they are being sent by message instead.
     * We can't load the block until we have them, as it might crash without.
      */
    return <BlockLoadingIndicator />;
  }

  /**
   * @todo Set loading / error states based on promise status and pass into block.
   *    in order to provide aggregateLoading, aggregateError, etc.
   */
  const queryEntities: GraphEmbedderMessageCallbacks["queryEntities"] = (
    ...payload
  ) =>
    sendMessage({
      payload,
      type: "queryEntities",
    });

  const queryEntityTypes: GraphEmbedderMessageCallbacks["queryEntityTypes"] = (
    ...payload
  ) =>
    sendMessage({
      payload,
      type: "queryEntityTypes",
    });

  const createEntity: GraphEmbedderMessageCallbacks["createEntity"] = (
    ...payload
  ) =>
    sendMessage({
      payload,
      type: "createEntity",
    });

  const updateEntity: GraphEmbedderMessageCallbacks["updateEntity"] = (
    ...payload
  ) => sendMessage({ payload, type: "updateEntity" });

  const getEmbedBlock: FetchEmbedCodeFn = (...payload) =>
    sendMessage({ payload, type: "getEmbedBlock" });

  if (typeof blockProperties.metadata.recordId.entityId !== "string") {
    throw new TypeError("No entityId present in block properties.");
  }

  const _blockFunctions = {
    queryEntities,
    queryEntityTypes,
    createEntity,
    getEmbedBlock,
    updateEntity,
  };

  // @todo fix sandbox for 0.2
  return null;

  // return (
  //   <Sentry.ErrorBoundary
  //     beforeCapture={beforeCapture}
  //     // eslint-disable-next-line react/no-unstable-nested-components -- @todo consider refactoring
  //     fallback={(errorData) => (
  //       <ErrorBlock {...errorData} onRetry={() => window.location.reload()} />
  //     )}
  //   >
  //     <RemoteBlock
  //       blockFunctions={blockFunctions as any}
  //       blockProperties={blockProperties}
  //       crossFrame
  //       sourceUrl={sourceUrl}
  //     />
  //   </Sentry.ErrorBoundary>
  // );
};
