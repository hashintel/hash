import * as Sentry from "@sentry/nextjs";
import {
  BlockProtocolAggregateEntitiesFunction,
  BlockProtocolAggregateEntityTypesFunction,
  BlockProtocolCreateEntitiesFunction,
  BlockProtocolUpdateEntitiesFunction,
  JSONObject,
} from "blockprotocol";
import "iframe-resizer/js/iframeResizer.contentWindow";
import { useCallback, useEffect, useState, VoidFunctionComponent } from "react";

import { FetchEmbedCodeFn } from "../../BlockLoader/fetchEmbedCode";
import { ErrorBlock } from "../../ErrorBlock/ErrorBlock";
import {
  BlockLoadingIndicator,
  RemoteBlock,
} from "../../RemoteBlock/RemoteBlock";
import { MessageFromBlockFramer } from "../types";
import { sendMessage, settlePromiseFromResponse } from "./util";

const params = new URL(window.location.href).searchParams;

export const FramedBlock: VoidFunctionComponent = () => {
  const sourceUrl = params.get("sourceUrl");
  const properties = params.get("properties");

  const initialData = properties ? JSON.parse(properties) : undefined;

  const [blockProperties, setBlockProperties] = useState<
    JSONObject | undefined
  >(initialData);

  const beforeCapture = useCallback(
    (scope: Sentry.Scope) => {
      scope.setTag("block", blockProperties?.id as string);
    },
    [blockProperties],
  );

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

  const props = {
    ...blockProperties,
    aggregateEntities,
    aggregateEntityTypes,
    createEntities,
    getEmbedBlock,
    updateEntities,
  };

  if (sourceUrl.endsWith(".html")) {
    /**
     * One answer to 'how do you make functions and properties available to HTML blocks?'
     * @todo see how this works with HTML blocks of any complexity
     */
    Object.assign(window, props);
  }

  return (
    <Sentry.ErrorBoundary
      beforeCapture={beforeCapture}
      // eslint-disable-next-line react/no-unstable-nested-components -- @todo consider refactoring
      fallback={(errorData) => (
        <ErrorBlock {...errorData} onRetry={() => window.location.reload()} />
      )}
    >
      <RemoteBlock {...props} crossFrame sourceUrl={sourceUrl} />
    </Sentry.ErrorBoundary>
  );
};
