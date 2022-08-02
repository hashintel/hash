import { BlockMetadata, UnknownRecord } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { useGraphEmbedderService } from "@blockprotocol/graph/react";
import { FunctionComponent, useEffect, useRef } from "react";
import { BlockRenderer } from "./blockRenderer";

import { useRemoteBlock } from "./useRemoteBlock";

type RemoteBlockProps = {
  graphCallbacks: Omit<
    EmbedderGraphMessageCallbacks,
    | "getEntity"
    | "getEntityType"
    | "getLink"
    | "getLinkedAggregation"
    | "deleteEntity"
    | "deleteEntityType"
  >;
  graphProperties: Required<BlockGraphProperties<UnknownRecord>["graph"]>;
  blockMetadata: BlockMetadata;
  crossFrame?: boolean;
  editableRef?: unknown;
  onBlockLoaded?: () => void;
};

export const BlockLoadingIndicator: FunctionComponent = () => (
  <div>Loading...</div>
);

/**
 * Loads and renders a block from a URL, instantiates the graph service handler,
 * and passes the block the provided graphProperties
 *
 * @see https://github.com/Paciolan/remote-component for the original inspiration
 */
export const RemoteBlock: FunctionComponent<RemoteBlockProps> = ({
  blockMetadata,
  crossFrame,
  editableRef,
  graphCallbacks,
  graphProperties,
  onBlockLoaded,
}) => {
  const [loading, err, blockSource] = useRemoteBlock(
    blockMetadata.source,
    crossFrame,
    onBlockLoaded,
  );

  const wrapperRef = useRef<HTMLDivElement>(null);

  const { graphService } = useGraphEmbedderService(wrapperRef, {
    callbacks: graphCallbacks,
    ...graphProperties,
  });

  useEffect(() => {
    if (graphService) {
      graphService.blockEntity({ data: graphProperties.blockEntity });
    }
  }, [graphProperties.blockEntity, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.blockGraph({ data: graphProperties.blockGraph });
    }
  }, [graphProperties.blockGraph, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.entityTypes({ data: graphProperties.entityTypes });
    }
  }, [graphProperties.entityTypes, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.linkedAggregations({
        data: graphProperties.linkedAggregations,
      });
    }
  }, [graphProperties.linkedAggregations, graphService]);

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (!blockSource) {
    throw new Error("Could not load and parse block from URL");
  }

  if (err) {
    throw err;
  }

  const propsToInject: BlockGraphProperties<Record<string, any>> & {
    editableRef: any;
  } = {
    editableRef,
    graph: graphProperties,
  };

  return (
    <div ref={wrapperRef}>
      {graphService ? (
        <BlockRenderer
          blockSource={blockSource}
          blockType={blockMetadata.blockType}
          properties={propsToInject}
          sourceUrl={blockMetadata.source}
        />
      ) : null}
    </div>
  );
};
