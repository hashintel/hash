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

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
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

type GraphState = {
  hoveredNodeId: string | null;
  hoveredNeighborIds: Set<string> | null;
};

export const GraphLoader = ({
  highlightDepth,
  onTypeClick,
  types,
}: TypesGraphProps) => {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();

  const sigma = useSigma();

  const layout = useLayout();

  const { palette } = useTheme();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const graphState = useRef<GraphState>({
    hoveredNodeId: null,
    hoveredNeighborIds: null,
  });

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        onTypeClick(event.node.split("~")[0]! as VersionedUrl);
      },
      enterNode: (event) => {
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

        sigma.refresh({ skipIndexation: true });
      },
      leaveNode: () => {
        graphState.current.hoveredNodeId = null;
        graphState.current.hoveredNeighborIds = null;
        sigma.refresh({ skipIndexation: true });
      },
    });
  }, [highlightDepth, onTypeClick, registerEvents, sigma]);

  useEffect(() => {
    sigma.setSetting("nodeReducer", (node, data) => {
      const nodeData = { ...data };

      const state = graphState.current;

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return nodeData;
      }

      if (state.hoveredNodeId !== node && !state.hoveredNeighborIds.has(node)) {
        nodeData.color = palette.gray[30];
        nodeData.label = "";
      } else {
        nodeData.forceLabel = true;
      }

      return nodeData;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const edgeData = { ...data };

      const state = graphState.current;

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return edgeData;
      }

      const activeIds = [...state.hoveredNodeId, ...state.hoveredNeighborIds];

      let targetIsShown = false;
      let sourceIsShown = false;

      const graph = sigma.getGraph();
      const source = graph.source(edge);
      const target = graph.target(edge);

      for (const id of activeIds) {
        if (source === id) {
          sourceIsShown = true;
        }
        if (target === id) {
          targetIsShown = true;
        }

        if (sourceIsShown && targetIsShown) {
          break;
        }
      }

      edgeData.hidden = !(sourceIsShown && targetIsShown);

      return edgeData;
    });
  }, [palette, sigma]);

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
      size: 15,
    };
    const anythingNodeId = "anything";

    for (const { schema } of types) {
      if (schema.kind !== "entityType") {
        continue;
      }

      const entityTypeId = schema.$id;

      const isLink = isSpecialEntityTypeLookup?.[entityTypeId]?.isLink;
      if (isLink) {
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
        size: 10,
      });
      addedNodeIds.add(entityTypeId);

      for (const [linkTypeId, destinationSchema] of typedEntries(
        schema.links ?? {},
      )) {
        const destinationTypeIds =
          "oneOf" in destinationSchema.items
            ? destinationSchema.items.oneOf.map((dest) => dest.$ref)
            : null;

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
            size: 10,
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
            if (!addedNodeIds.has(anythingNodeId)) {
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
