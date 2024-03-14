import type { BlockMetadata } from "@blockprotocol/core";
import type {
  BlockGraphProperties,
  GraphEmbedderMessageCallbacks,
} from "@blockprotocol/graph/temporal";
import { useGraphEmbedderModule } from "@blockprotocol/graph/temporal/react";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/temporal/stdlib";
import { useHookEmbedderModule } from "@blockprotocol/hook/react";
import { useServiceEmbedderModule } from "@blockprotocol/service/react";
import { textualContentPropertyTypeBaseUrl } from "@local/hash-isomorphic-utils/entity-store";
import { blockProtocolLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SkeletonProps } from "@mui/material";
import { Skeleton } from "@mui/material";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";

import { useUserBlocks } from "../../blocks/user-blocks";
import { AddLinkedQueryPrompt } from "./add-linked-query-prompt";
import { BlockRenderer } from "./block-renderer";
import { serviceModuleCallbacks } from "./construct-service-module-callbacks";
import { useRemoteBlock } from "./use-remote-block";

export type RemoteBlockProps = {
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
  editableRef: ((node: HTMLElement | null) => void) | null;
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
  const { value: userBlocks } = useUserBlocks();

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

  useServiceEmbedderModule(wrapperRef, { callbacks: serviceModuleCallbacks });

  useHookEmbedderModule(wrapperRef, {
    callbacks: {
      // eslint-disable-next-line @typescript-eslint/require-await -- async is required upstream
      async hook({ data }) {
        if (
          data?.type === "text" &&
          data.path.length === 1 &&
          data.path[0] === textualContentPropertyTypeBaseUrl
        ) {
          if (!editableRef) {
            return {
              errors: [
                {
                  code: "NOT_IMPLEMENTED",
                  message: "Hook text module not implemented in this context",
                },
              ],
            };
          }

          editableRef(data.node);

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

  const blockSchema = useMemo(() => {
    const blockSchemaId = blockMetadata.schema;

    return Object.values(userBlocks).find(
      ({ schema }) => schema && schema.$id === blockSchemaId,
    )?.schema;
  }, [userBlocks, blockMetadata]);

  const blockSchemaRequiresOutgoingHasQueryLinks = useMemo(() => {
    if (blockSchema) {
      return Object.entries(blockSchema.links ?? {}).some(
        ([linkEntityTypeId, value]) =>
          linkEntityTypeId ===
            blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId &&
          value.minItems &&
          value.minItems > 0,
      );
    }

    return false;
  }, [blockSchema]);

  const blockHasMissingHasQueryLinks = useMemo(() => {
    if (blockSchemaRequiresOutgoingHasQueryLinks) {
      const blockEntity = getRoots(graphProperties.blockEntitySubgraph)[0];

      if (blockEntity) {
        const outgoingLinks = getOutgoingLinksForEntity(
          graphProperties.blockEntitySubgraph,
          blockEntity.metadata.recordId.entityId,
        );

        return !outgoingLinks.some(
          (link) =>
            link.metadata.entityTypeId ===
            blockProtocolLinkEntityTypes.hasQuery.linkEntityTypeId,
        );
      }
    }

    return false;
  }, [graphProperties, blockSchemaRequiresOutgoingHasQueryLinks]);

  if (loading) {
    return <BlockLoadingIndicator />;
  }

  if (blockHasMissingHasQueryLinks) {
    return (
      <AddLinkedQueryPrompt
        blockIconSrc={blockMetadata.icon ?? undefined}
        blockName={blockMetadata.displayName ?? blockMetadata.name}
      />
    );
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
