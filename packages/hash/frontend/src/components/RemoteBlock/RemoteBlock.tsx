import { BlockMetadata, UnknownRecord } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { useGraphEmbedderService } from "@blockprotocol/graph/react";
import React from "react";
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
  sourceUrl: string;
};

export const BlockLoadingIndicator: React.VFC = () => <div>Loading...</div>;

/**
 * Loads and renders a block from a URL, instantiates the graph service handler,
 * and passes the block the provided graphProperties
 *
 * @see https://github.com/Paciolan/remote-component for the original inspiration
 */
export const RemoteBlock: React.VFC<RemoteBlockProps> = ({
  blockMetadata,
  crossFrame,
  editableRef,
  graphCallbacks,
  graphProperties,
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
    callbacks: graphCallbacks,
    ...graphProperties,
  });

  React.useEffect(() => {
    if (graphService) {
      graphService.blockEntity({ data: graphProperties.blockEntity });
    }
  }, [graphProperties.blockEntity, graphService]);

  React.useEffect(() => {
    if (graphService) {
      graphService.blockGraph({ data: graphProperties.blockGraph });
    }
  }, [graphProperties.blockGraph, graphService]);

  React.useEffect(() => {
    if (graphService) {
      graphService.entityTypes({ data: graphProperties.entityTypes });
    }
  }, [graphProperties.entityTypes, graphService]);

  React.useEffect(() => {
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

  // @todo remove this React default when we update all blocks to 0.2
  const entryPoint = blockMetadata.blockType?.entryPoint ?? "react";

  if (entryPoint === "html" && typeof blockSource !== "string") {
    throw new Error(
      `'html' entryPoint expects source to be typeof 'string', but got: ${typeof blockSource}`,
    );
  } else if (entryPoint === "custom-element") {
    if (!(blockSource instanceof HTMLElement)) {
      throw new Error(
        `'custom-element' entryPoint expects parsed source to be instanceof 'HTMLElement'`,
      );
    }
    if (typeof blockMetadata.blockType.tagName !== "string") {
      throw new Error(
        `Must provide blockType.tagName when entryPoint is 'custom-element'`,
      );
    }
  } else if (entryPoint === "react" && typeof blockSource !== "function") {
    throw new Error(
      `'react' entryPoint expects parsed source to be typeof 'function', but got: ${typeof blockSource}`,
    );
  } else if (!["html", "custom-element", "react"].includes(entryPoint)) {
    throw new Error(`Invalid entryPoint '${entryPoint}'`);
  }

  return (
    <div ref={wrapperRef}>
      {graphService ? (
        <BlockRenderer
          customElement={
            entryPoint === "custom-element"
              ? {
                  elementClass: blockSource as typeof HTMLElement,
                  tagName: blockMetadata.blockType.tagName as string,
                }
              : undefined
          }
          html={
            entryPoint === "html"
              ? { source: blockSource as string, url: sourceUrl }
              : undefined
          }
          properties={propsToInject}
          ReactComponent={
            entryPoint === "react"
              ? (blockSource as (...props: any[]) => JSX.Element)
              : undefined
          }
        />
      ) : null}
    </div>
  );
};
