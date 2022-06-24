import {
  EmbedderGraphMessageCallbacks,
  Entity,
  useGraphEmbedderService,
} from "@blockprotocol/graph";
import React from "react";

import { HtmlBlock } from "../HtmlBlock/HtmlBlock";
import { useRemoteBlock } from "./useRemoteBlock";

type RemoteBlockProps = {
  graphCallbacks: EmbedderGraphMessageCallbacks;
  blockEntity: Entity;
  blockMetadata:
  crossFrame?: boolean;
  editableRef?: unknown;
  onBlockLoaded?: () => void;
  sourceUrl: string;
};

export const BlockLoadingIndicator: React.VFC = () => <div>Loading...</div>;

/**
 * @see https://github.com/Paciolan/remote-component/blob/2b2cfbb5b6006117c56f3aa7daa2292d3823bb83/src/createRemoteComponent.tsx
 */
export const RemoteBlock: React.VFC<RemoteBlockProps> = ({
  blockEntity,
  blockMetadata,
  crossFrame,
  editableRef,
  graphCallbacks,
  onBlockLoaded,
  sourceUrl,
}) => {
  const [loading, err, Component] = useRemoteBlock(
    sourceUrl,
    crossFrame,
    onBlockLoaded,
  );

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (!Component) {
    throw new Error("Could not load and parse block from URL");
  }

  if (err) {
    throw err;
  }

  const propsToInject: BlockGraphProperties<any> = {
    graph: {
      blockEntity,
      blockGraph,
      entityTypes,
      linkedAggregations,
    },
  };

  useEffect(() => {
    if (!wrapperRef.current) {
      throw new Error(
        "No reference to wrapping element – cannot listen for messages from block",
      );
    } else if (!graphService) {
      setGraphService(
        new GraphEmbedderHandler({
          blockGraph,
          blockEntity,
          linkedAggregations,
          callbacks: graphServiceCallbacks,
          element: wrapperRef.current,
        }),
      );
    }
  }, [
    blockEntity,
    blockGraph,
    graphService,
    graphServiceCallbacks,
    linkedAggregations,
  ]);

  useEffect(() => {
    if (graphService) {
      graphService.blockEntity({ data: blockEntity });
    }
  }, [blockEntity, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.blockGraph({ data: blockGraph });
    }
  }, [blockGraph, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.entityTypes({ data: entityTypes });
    }
  }, [entityTypes, graphService]);

  useEffect(() => {
    if (graphService) {
      graphService.linkedAggregations({ data: linkedAggregations });
    }
  }, [linkedAggregations, graphService]);

  <div ref={wrapperRef}>
    {graphService ? (
      <BlockRenderer
        customElement={
          "customElement" in blockDefinition
            ? blockDefinition.customElement
            : undefined
        }
        htmlString={
          "htmlString" in blockDefinition
            ? blockDefinition.htmlString
            : undefined
        }
        properties={propsToInject}
        ReactComponent={
          "ReactComponent" in blockDefinition
            ? blockDefinition.ReactComponent
            : undefined
        }
      />
    ) : null}
  </div>
};
