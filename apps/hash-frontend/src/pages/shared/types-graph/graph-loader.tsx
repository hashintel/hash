import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { useTheme } from "@mui/material";
import { useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { useEffect, useRef } from "react";
import type { SigmaNodeEventPayload } from "sigma/types";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFullScreen } from "./shared/full-screen";
import { useDefaultSettings } from "./shared/settings";
import type { GraphState } from "./shared/state";
import { useLayout } from "./use-layout";

export type TypesGraphProps = {
  highlightDepth: number;
  onTypeClick: (typeId: VersionedUrl) => void;
  types: (
    | DataTypeWithMetadata
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
  )[];
};

const anythingNodeId = "anything";

export const GraphLoader = ({
  highlightDepth,
  onTypeClick,
  types,
}: TypesGraphProps) => {
  /**
   * Hooks provided by the react-sigma library to simplify working with the sigma instance.
   */
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();

  /**
   * Custom hooks for laying out the graph, and handling fullscreen state
   */
  const layout = useLayout();
  const { isFullScreen } = useFullScreen();

  const { palette } = useTheme();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  /**
   * State to track interactions with the graph.
   * It's drawn in canvas so doesn't need to be in React state
   * – redrawing the graph is done via sigma.refresh.
   */
  const graphState = useRef<GraphState>({
    hoveredNodeId: null,
    hoveredNeighborIds: null,
    selectedNodeId: null,
  });

  useDefaultSettings(graphState.current);

  useEffect(() => {
    /**
     * Highlight a node and its neighbors up to a certain depth.
     */
    const highlightNode = (event: SigmaNodeEventPayload) => {
      graphState.current.hoveredNodeId = event.node;

      const getNeighbors = (
        nodeId: string,
        neighborIds: Set<string> = new Set(),
        depth = 1,
      ) => {
        if (depth > highlightDepth) {
          return neighborIds;
        }

        const directNeighbors = sigma.getGraph().neighbors(nodeId);

        for (const neighbor of directNeighbors) {
          neighborIds.add(neighbor);
          getNeighbors(neighbor, neighborIds, depth + 1);
        }

        return neighborIds;
      };

      graphState.current.hoveredNeighborIds = getNeighbors(event.node);

      /**
       * We haven't touched the graph data, so don't need to re-index.
       * An additional optimization would be to supply partialGraph here and only redraw the affected nodes,
       * but since the nodes whose appearance changes are the NON-highlighted nodes (they disappear), it's probably not worth it
       * – they are likely to be the majority anyway, and we'd have to generate an array of them.
       */
      sigma.refresh({ skipIndexation: true });
    };

    const removeHighlights = () => {
      graphState.current.hoveredNodeId = null;
      graphState.current.hoveredNeighborIds = null;
      sigma.refresh({ skipIndexation: true });
    };

    registerEvents({
      clickNode: (event) => {
        if (!isFullScreen && event.node !== anythingNodeId) {
          onTypeClick(event.node.split("~")[0]! as VersionedUrl);
        }

        graphState.current.selectedNodeId = event.node;
        highlightNode(event);
      },
      clickStage: () => {
        if (!graphState.current.selectedNodeId) {
          return;
        }

        /**
         * If we click on the background (the 'stage'), deselect the selected node.
         */
        graphState.current.selectedNodeId = null;
        removeHighlights();
      },
      enterNode: (event) => {
        graphState.current.selectedNodeId = null;
        highlightNode(event);
      },
      leaveNode: () => {
        if (graphState.current.selectedNodeId) {
          /**
           * If there's a selected node (has been clicked on), we don't want to remove highlights.
           * The user can click the background or another node to deselect it.
           */
          return;
        }
        removeHighlights();
      },
    });
  }, [highlightDepth, isFullScreen, onTypeClick, registerEvents, sigma]);

  useEffect(() => {
    const graph = new MultiDirectedGraph();

    const edgesToAdd: {
      source: string;
      target: string;
    }[] = [];

    const addedNodeIds = new Set<string>();

    const anythingNode = {
      color: palette.gray[30],
      x: 0,
      y: 0,
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

      graph.addNode(entityTypeId, {
        color: palette.blue[70],
        /**
         * use a simple grid layout to start, to be improved upon by the layout algorithm once the full graph is built
         */
        x: addedNodeIds.size % 20,
        y: Math.floor(addedNodeIds.size / 20),
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
        const linkNodeId = `${linkTypeId}~${destinationTypeIds?.join("-") ?? "anything"}`;

        if (!addedNodeIds.has(linkNodeId)) {
          const linkSchema = types.find(
            (type) => type.schema.$id === linkTypeId,
          )?.schema;

          if (!linkSchema) {
            continue;
          }

          graph.addNode(linkNodeId, {
            color: palette.common.black,
            x: addedNodeIds.size % 20,
            y: Math.floor(addedNodeIds.size / 20),
            label: linkSchema.title,
            size: 12,
          });
          addedNodeIds.add(linkNodeId);

          if (destinationTypeIds) {
            for (const destinationTypeId of destinationTypeIds) {
              edgesToAdd.push({
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
              graph.addNode(anythingNodeId, anythingNode);
              addedNodeIds.add(anythingNodeId);
            }
            edgesToAdd.push({
              source: linkNodeId,
              target: anythingNodeId,
            });
          }
        }

        edgesToAdd.push({
          source: entityTypeId,
          target: linkNodeId,
        });
      }
    }

    for (const edge of edgesToAdd) {
      graph.addEdgeWithKey(
        `${edge.source}~${edge.target}`,
        edge.source,
        edge.target,
        {
          size: 3,
          type: "arrow",
        },
      );
    }

    loadGraph(graph);

    layout();
  }, [layout, loadGraph, isSpecialEntityTypeLookup, palette, sigma, types]);

  return null;
};
