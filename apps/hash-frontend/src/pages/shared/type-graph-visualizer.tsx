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

    for (const { schema } of types) {
      if (schema.kind !== "entityType") {
        /**
         * Don't yet add property or data types to the graph.
         */
        continue;
      }

      const entityTypeId = schema.$id;

      const isLink = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;
      if (isLink) {
        /**
         * We'll add the links as we process each entity type.
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

          if (destinationTypeIds) {
            for (const destinationTypeId of destinationTypeIds) {
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
