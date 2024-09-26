import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
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
     * We need to track all the occurrences of a link type, so that if we encounter a link A which links to a link B,
     * we can link from link A to all the occurrences of link B.
     */
    const linkNodesByEntityTypeId: Record<VersionedUrl, string[]> = {};

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
         * We'll add the links as we process each entity type – this means that any link types which are unused won't appear in the graph.
         */
        continue;
      }

      nodesToAdd.push({
        nodeId: entityTypeId,
        color: palette.blue[70],
        label: schema.title,
        size: 14,
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

          nodesToAdd.push({
            nodeId: linkNodeId,
            color: palette.common.black,
            label: linkSchema.title,
            size: 12,
          });
          addedNodeIds.add(linkNodeId);

          linkNodesByEntityTypeId[linkTypeId] ??= [];
          linkNodesByEntityTypeId[linkTypeId].push(linkNodeId);

          if (destinationTypeIds) {
            for (const destinationTypeId of destinationTypeIds) {
              let targetNodeIds: string[] = [destinationTypeId];

              if (isSpecialEntityTypeLookup?.[destinationTypeId]?.isLink) {
                /**
                 * If the destination is itself a link, we need to account for the multiple places the destination link may appear.
                 */
                targetNodeIds =
                  linkNodesByEntityTypeId[destinationTypeId] ?? [];
              }

              for (const targetNodeId of targetNodeIds) {
                edgesToAdd.push({
                  edgeId: `${linkNodeId}~${targetNodeId}`,
                  size: 3,
                  source: linkNodeId,
                  target: targetNodeId,
                });
              }
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
        }

        edgesToAdd.push({
          edgeId: `${entityTypeId}~${linkNodeId}`,
          size: 3,
          source: entityTypeId,
          target: linkNodeId,
        });
      }
    }

    return {
      edges: edgesToAdd,
      nodes: nodesToAdd,
    };
  }, [isSpecialEntityTypeLookup, palette, types]);

  const onNodeClick = useCallback<
    NonNullable<GraphVisualizerProps["onNodeClick"]>
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
    <GraphVisualizer onNodeClick={onNodeClick} edges={edges} nodes={nodes} />
  );
};
