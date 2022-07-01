import { BlockMetadata } from "@blockprotocol/core";
import {
  BlockGraph,
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
  Entity,
  EntityType,
  LinkedAggregation,
  useGraphEmbedderService,
} from "@blockprotocol/graph";
import React from "react";
import { BlockRenderer } from "./blockRenderer";

import { useRemoteBlock } from "./useRemoteBlock";

type RemoteBlockProps = {
  graphCallbacks: EmbedderGraphMessageCallbacks;
  blockEntity: Entity;
  blockGraph?: BlockGraph;
  blockMetadata: BlockMetadata;
  crossFrame?: boolean;
  editableRef?: unknown;
  entityTypes?: EntityType[];
  linkedAggregations?: LinkedAggregation[];
  onBlockLoaded?: () => void;
  sourceUrl: string;
};

export const BlockLoadingIndicator: React.VFC = () => <div>Loading...</div>;

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: React.VFC<RemoteBlockProps> = ({
  blockEntity,
  blockGraph,
  blockMetadata,
  crossFrame,
  editableRef,
  entityTypes,
  graphCallbacks,
  linkedAggregations,
  onBlockLoaded,
  sourceUrl,
}) => {
  const [loading, err, blockSource] = useRemoteBlock(
    sourceUrl,
    crossFrame,
    onBlockLoaded,
  );

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const { graphService } = useGraphEmbedderService(wrapperRef, {
    blockGraph,
    blockEntity,
    callbacks: graphCallbacks,
  });

  React.useEffect(() => {
    if (graphService) {
      graphService.blockEntity({ data: blockEntity });
    }
  }, [blockEntity, graphService]);

  React.useEffect(() => {
    if (graphService) {
      graphService.blockGraph({ data: blockGraph });
    }
  }, [blockGraph, graphService]);

  React.useEffect(() => {
    if (graphService) {
      graphService.entityTypes({ data: entityTypes });
    }
  }, [entityTypes, graphService]);

  React.useEffect(() => {
    if (graphService) {
      graphService.linkedAggregations({ data: linkedAggregations });
    }
  }, [linkedAggregations, graphService]);

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (!blockSource) {
    throw new Error("Could not load and parse block from URL");
  }

  if (err) {
    throw err;
  }

  const propsToInject: BlockGraphProperties<any> & { editableRef: any } = {
    editableRef,
    graph: {
      blockEntity,
      blockGraph,
      entityTypes,
      linkedAggregations,
    },
  };

  const { entryPoint } = blockMetadata.blockType;

  return (
    <div ref={wrapperRef}>
      {graphService ? (
        <BlockRenderer
          customElement={
            (entryPoint === "custom-element" ? blockSource : undefined) as any
          }
          htmlString={(entryPoint === "html" ? blockSource : undefined) as any}
          properties={propsToInject}
          ReactComponent={
            (entryPoint === "react" ? blockSource : undefined) as any
          }
        />
      ) : null}
    </div>
  );
};
