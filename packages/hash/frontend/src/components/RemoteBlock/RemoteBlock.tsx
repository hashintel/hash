import { BlockMetadata, UnknownRecord } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  EmbedderGraphMessageCallbacks,
} from "@blockprotocol/graph";
import { useGraphEmbedderService } from "@blockprotocol/graph/react";
import { HookData, useHookEmbedderService } from "@blockprotocol/hook";
import { FunctionComponent, useEffect, useRef } from "react";
import { v4 as uuid } from "uuid";
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
  editableRef?: (node: HTMLElement | null) => void;
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

  const hookIdRef = useRef<string | null>(null);

  useHookEmbedderService(wrapperRef, {
    callbacks: {
      async hook({ data }) {
        console.log(data);
        if (
          data?.type === "text" &&
          data.path === "$.text" &&
          (!hookIdRef.current || data.hookId === hookIdRef.current)
        ) {
          editableRef?.(data.node);

          const hookId = data.hookId ?? uuid();
          hookIdRef.current = hookId;
          return { data: { hookId } };
        }

        return {
          errors: [{ code: "NOT_IMPLEMENTED", message: "Improper hook" }],
        };
      },
    },
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

  useEffect(() => {
    if (graphService) {
      graphService.readonly({
        data: graphProperties.readonly,
      });
    }
  }, [graphProperties.readonly, graphService]);

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
