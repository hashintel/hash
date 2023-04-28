import { BlockMetadata } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  GraphEmbedderMessageCallbacks,
} from "@blockprotocol/graph/temporal";
import { useGraphEmbedderModule } from "@blockprotocol/graph/temporal/react";
import { useHookEmbedderModule } from "@blockprotocol/hook/react";
import { Skeleton, SkeletonProps } from "@mui/material";
import { FunctionComponent, useEffect, useRef } from "react";
import { v4 as uuid } from "uuid";

import { BlockRenderer } from "./block-renderer";
import { useRemoteBlock } from "./use-remote-block";

type RemoteBlockProps = {
  graphCallbacks: Omit<
    /** @todo-0.3 - Add these back */
    GraphEmbedderMessageCallbacks,
    | "createEntity"
    | "getEntity"
    | "queryEntities"
    | "deleteEntity"
    | "createLink"
    | "getLink"
    | "updateLink"
    | "deleteLink"
    | "getLinkedAggregation"
    | "createPropertyType"
    | "queryPropertyTypes"
    | "updatePropertyType"
    | "getPropertyType"
    | "getDataType"
    | "queryDataTypes"
    | "createEntityType"
    | "queryEntityTypes"
    | "updateEntityType"
    | "getEntityType"
    | "deleteEntityType"
    | "createLinkedAggregation"
    | "updateLinkedAggregation"
    | "deleteLinkedAggregation"
    | "uploadFile"
  >;
  graphProperties: Required<BlockGraphProperties["graph"]>;
  blockMetadata: BlockMetadata;
  crossFrame?: boolean;
  editableRef?: (node: HTMLElement | null) => void;
  onBlockLoaded?: () => void;
};

export const BlockLoadingIndicator: FunctionComponent<{
  sx?: SkeletonProps["sx"];
}> = ({ sx = [] }) => (
  <Skeleton
    animation="wave"
    variant="rectangular"
    sx={[
      { borderRadius: 1, height: "32px" },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  />
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

  const { graphModule } = useGraphEmbedderModule(wrapperRef, {
    callbacks: graphCallbacks,
    ...graphProperties,
  });

  useEffect(() => {
    graphModule.registerCallbacks(graphCallbacks);
  }, [graphCallbacks, graphModule]);

  useHookEmbedderModule(wrapperRef, {
    callbacks: {
      // eslint-disable-next-line @typescript-eslint/require-await -- async is required upstream
      async hook({ data }) {
        if (
          data?.type === "text" &&
          data.path.length === 1 &&
          data.path[0] ===
            "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"
        ) {
          editableRef?.(data.node);

          const hookId = data.hookId ?? uuid();
          return { data: { hookId } };
        }

        return {
          errors: [{ code: "NOT_IMPLEMENTED", message: "Improper hook" }],
        };
      },
    },
  });

  useEffect(() => {
    graphModule.blockEntitySubgraph({
      data: graphProperties.blockEntitySubgraph,
    });
  }, [graphProperties.blockEntitySubgraph, graphModule]);

  useEffect(() => {
    graphModule.readonly({
      data: graphProperties.readonly,
    });
  }, [graphProperties.readonly, graphModule]);

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (!blockSource) {
    throw new Error("Could not load and parse block from URL");
  }

  if (err) {
    throw err;
  }

  const propsToInject: BlockGraphProperties = {
    graph: graphProperties,
  };

  return (
    <div ref={wrapperRef}>
      <BlockRenderer
        blockSource={blockSource}
        blockType={blockMetadata.blockType}
        properties={propsToInject}
        sourceUrl={blockMetadata.source}
      />
    </div>
  );
};
