import "iframe-resizer/js/iframeResizer.contentWindow";

import * as Sentry from "@sentry/react";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntityTypesFunction,
  BlockProtocolCreateEntitiesFunction,
  BlockProtocolEntity,
  BlockProtocolUpdateEntitiesFunction,
} from "blockprotocol";
import { FunctionComponent, useCallback, useEffect, useState } from "react";

import { FetchEmbedCodeFn } from "../../block-loader/fetch-embed-code";
// import { ErrorBlock } from "../../error-block/error-block";
import {
  BlockLoadingIndicator,
  // RemoteBlock,
} from "../../remote-block/remote-block";
import { MessageFromBlockFramer } from "../types";
import { sendMessage, settlePromiseFromResponse } from "./util";

const params = new URL(window.location.href).searchParams;

export const FramedBlock: FunctionComponent = () => {
  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties ? JSON.parse(properties) : undefined;

  const [blockProperties, setBlockProperties] = useState<
    BlockProtocolEntity | undefined
  >(initialData);

  const _beforeCapture = useCallback(
    (scope: Sentry.Scope) => {
      scope.setTag("block", blockProperties?.entityId as string);
    },
    [blockProperties],
  );

  useEffect(() => {
    const msgHandler = ({ data }: MessageEvent<MessageFromBlockFramer>) => {
      switch (data.type) {
        case "newData":
          setBlockProperties(data.payload as BlockProtocolEntity);
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
  const aggregateEntities: BlockProtocolAggregateEntitiesFunction = (
    ...payload
  ) =>
    sendMessage({
      payload,
      type: "aggregateEntities",
    });

  const aggregateEntityTypes: BlockProtocolAggregateEntityTypesFunction = (
    ...payload
  ) =>
    sendMessage({
      payload,
      type: "aggregateEntityTypes",
    });

  const createEntities: BlockProtocolCreateEntitiesFunction = (...payload) =>
    sendMessage({
      payload,
      type: "createEntities",
    });

  const updateEntities: BlockProtocolUpdateEntitiesFunction = (...payload) =>
    sendMessage({ payload, type: "updateEntities" });

  const getEmbedBlock: FetchEmbedCodeFn = (...payload) =>
    sendMessage({ payload, type: "getEmbedBlock" });

  if (typeof blockProperties.entityId !== "string") {
    throw new Error("No entityId present in block properties.");
  }

  const _blockFunctions = {
    aggregateEntities,
    aggregateEntityTypes,
    createEntities,
    getEmbedBlock,
    updateEntities,
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
