import { ActionBlockMessages } from "@blockprotocol/action";
import { useActionEmbedderModule } from "@blockprotocol/action/react";
import { BlockMetadata } from "@blockprotocol/core";
import {
  BlockGraphProperties,
  GraphEmbedderMessageCallbacks,
} from "@blockprotocol/graph/temporal";
import { useGraphEmbedderModule } from "@blockprotocol/graph/temporal/react";
import { useHookEmbedderModule } from "@blockprotocol/hook/react";
import { EntityId } from "@local/hash-subgraph";
import { Skeleton, SkeletonProps } from "@mui/material";
import { FunctionComponent, useEffect, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";

import {
  BlockActionsByElement,
  useActionsContext,
} from "../../pages/[shortname]/[page-slug].page/actions-context";
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
  wrappingEntityId: string;
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
  wrappingEntityId,
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

  const { processEvent, setBlockActions } = useActionsContext();

  const { actionModule } = useActionEmbedderModule(wrapperRef);

  const actionCallbacks = useMemo<ActionBlockMessages>(
    () => ({
      action: ({ data }) => {
        if (!data) {
          return { errors: [{ code: "INVALID_INPUT", message: "No data" }] };
        }
        processEvent(wrappingEntityId as EntityId, data);
      },
      availableActions: ({ data }) => {
        if (!data) {
          return { errors: [{ code: "INVALID_INPUT", message: "No data" }] };
        }
        const actionsMap = data.actions.reduce<BlockActionsByElement>(
          (map, definition) => {
            const { actionName, elementId, label } = definition;
            /* eslint-disable no-param-reassign */
            map[elementId] ??= {};
            map[elementId]![actionName] = {
              eventTrigger: definition,
              updateTriggerLabel: label
                ? (newLabel: string) =>
                    actionModule.updateAction({
                      data: {
                        elementId,
                        actionName,
                        label: newLabel,
                      },
                    })
                : undefined,
            };
            /* eslint-enable no-param-reassign */
            return map;
          },
          {},
        );
        console.log({ actionsMap });
        setBlockActions(wrappingEntityId as EntityId, actionsMap);
      },
    }),
    [actionModule, processEvent, setBlockActions, wrappingEntityId],
  );

  useEffect(() => {
    // We don't register them in the actionModule constructor because they depend on using it
    actionModule.registerCallbacks(actionCallbacks);
  }, [actionCallbacks, actionModule]);

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
