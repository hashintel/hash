import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import { typedEntries, typedValues } from "@local/advanced-types/typed-entries";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { useTheme } from "@mui/material";
import { useCallback, useMemo } from "react";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import type { GraphVisualizerProps } from "./graph-visualizer";
import { GraphVisualizer } from "./graph-visualizer";
import type {
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer/graph-container/graph-data-loader";

const anythingNodeId = "anything";

export const TypeGraphVisualizer = ({
  onTypeClick,
  types,
}: {
  onTypeClick: (typeId: VersionedUrl) => void;
  types: (
    | DataTypeWithMetadata
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
  )[];
}) => {
  const { palette } = useTheme();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { edges, nodes } = useMemo(() => {
    const edgesToAdd: GraphVizEdge[] = [];
    const nodesToAdd: GraphVizNode[] = [];

    const addedNodeIds = new Set<string>();

    const anythingNode: GraphVizNode = {
      color: palette.gray[30],
      nodeId: anythingNodeId,
      label: "Anything",
      size: 18,
    };

    /**
     * Link types can appear multiple times in the visualization (one per each destination combination).
     * We need to track all the (a) occurrences of a link type, and (b) nodes which link to it,
     * so that we can link from all nodes that to all the occurrences of a link type (if any nodes link to a link).
     *
     * @todo this doesn't yet handle the case where a _link_ links to a link (rather than another node linking to a
     *   link) this would involve checking the outgoing 'links' for each link type.
     */
    const linkNodesByEntityTypeId: Record<
      VersionedUrl,
      {
        instanceIds: string[];
        sourceIds: string[];
      }
    > = {};

    for (const { schema } of types) {
      if (schema.kind !== "entityType") {
        /**
         * We don't yet support visualizing property or data types to the graph.
         */
        continue;
      }

      const entityTypeId = schema.$id;

      const isLink = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;
      if (isLink) {
        /**
         * We'll add the links as we process each entity type – this means that any link types which are unused won't
         * appear in the graph.
         */
        continue;
      }

      nodesToAdd.push({
        nodeId: entityTypeId,
        color: palette.blue[70],
        label: schema.title,
        size: 18,
      });

      addedNodeIds.add(entityTypeId);

      for (const [linkTypeId, destinationSchema] of typedEntries(
        schema.links ?? {},
      )) {
        const destinationTypeIds =
          "oneOf" in destinationSchema.items
            ? destinationSchema.items.oneOf.map((dest) => dest.$ref)
            : null;

        /**
         * Links can be re-used by multiple different entity types, e.g.
         * @hash/person —> @hash/has-friend —> @hash/person
         * @alice/person —> @hash/has-friend —> @alice/person
         *
         * We need to create a separate link node per destination set, even if the link type is the same,
         * so that the user can tell the possible destinations for a given link type from a given entity type.
         * But we can re-use any with the same destination set.
         * The id is therefore based on the link type and the destination types.
         */
        const linkNodeId = `${linkTypeId}~${
          destinationTypeIds?.join("-") ?? "anything"
        }`;

        if (!addedNodeIds.has(linkNodeId)) {
          const linkSchema = types.find(
            (type) => type.schema.$id === linkTypeId,
          )?.schema;

          if (!linkSchema) {
            continue;
          }

          let isLinkToALink = false;

          if (destinationTypeIds) {
            for (const destinationTypeId of destinationTypeIds) {
              if (isSpecialEntityTypeLookup?.[destinationTypeId]?.isLink) {
                /**
                 * If the destination is itself a link, we need to account for the multiple places the destination link
                 * may appear. We won't have the full set until we've gone through all the non-link entity types,
                 * so we'll need to handle this in a separate loop afterward.
                 */
                linkNodesByEntityTypeId[destinationTypeId] ??= {
                  instanceIds: [],
                  sourceIds: [],
                };
                linkNodesByEntityTypeId[destinationTypeId].sourceIds.push(
                  linkNodeId,
                );

                isLinkToALink = true;
                continue;
              }

              edgesToAdd.push({
                edgeId: `${linkNodeId}~${destinationTypeId}`,
                size: 3,
                source: linkNodeId,
                target: destinationTypeId,
              });
            }
          } else {
            /**
             * There is no constraint on destinations, so we link it to the 'Anything' node.
             */
            if (!addedNodeIds.has(anythingNodeId)) {
              /**
               * We only add the Anything node if it's being used (i.e. here).
               */
              nodesToAdd.push(anythingNode);
              addedNodeIds.add(anythingNodeId);
            }
            edgesToAdd.push({
              edgeId: `${linkNodeId}~${anythingNodeId}`,
              size: 3,
              source: linkNodeId,
              target: anythingNodeId,
            });
          }

          nodesToAdd.push({
            nodeId: linkNodeId,
            color: isLinkToALink ? palette.gray[60] : palette.common.black,
            label: linkSchema.title,
            size: 14,
          });
          addedNodeIds.add(linkNodeId);

          linkNodesByEntityTypeId[linkTypeId] ??= {
            instanceIds: [],
            sourceIds: [],
          };
          linkNodesByEntityTypeId[linkTypeId].instanceIds.push(linkNodeId);
        }

        edgesToAdd.push({
          edgeId: `${entityTypeId}~${linkNodeId}`,
          size: 3,
          source: entityTypeId,
          target: linkNodeId,
        });
      }
    }

    /**
     * For each link, check if anything links to it, and if so link from that thing to all instances of the link
     */
    for (const { instanceIds, sourceIds } of typedValues(
      linkNodesByEntityTypeId,
    )) {
      for (const sourceId of sourceIds) {
        for (const instanceId of instanceIds) {
          edgesToAdd.push({
            edgeId: `${sourceId}~${instanceId}`,
            size: 3,
            source: sourceId,
            target: instanceId,
          });
        }
      }
    }

    return {
      edges: edgesToAdd,
      nodes: nodesToAdd,
    };
  }, [isSpecialEntityTypeLookup, palette, types]);

  const onNodeClick = useCallback<
    NonNullable<GraphVisualizerProps["onNodeSecondClick"]>
  >(
    ({ nodeId, isFullScreen }) => {
      if (nodeId === anythingNodeId) {
        return;
      }

      if (isFullScreen) {
        return;
      }

      const typeVersionedUrl = nodeId.split("~")[0] as VersionedUrl;

      onTypeClick(typeVersionedUrl);
    },
    [onTypeClick],
  );

  return (
    <GraphVisualizer
      defaultConfig={{
        filters: {},
        graphKey: "type-graph",
        nodeHighlighting: {
          direction: "All",
          depth: 1,
        },
        nodeSizing: { mode: "static" },
      }}
      onNodeSecondClick={onNodeClick}
      edges={edges}
      nodes={nodes}
    />
  );
};
