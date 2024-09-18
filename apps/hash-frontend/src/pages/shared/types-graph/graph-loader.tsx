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
    selectedNodeId: null,
  });

  useDefaultSettings(graphState.current);

  useEffect(() => {
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

      sigma.refresh({ skipIndexation: true });
    };

    const removeHighlights = () => {
      graphState.current.hoveredNodeId = null;
      graphState.current.hoveredNeighborIds = null;
      sigma.refresh({ skipIndexation: true });
    };

    registerEvents({
      clickNode: (event) => {
        onTypeClick(event.node.split("~")[0]! as VersionedUrl);
        graphState.current.selectedNodeId = event.node;
        highlightNode(event);
      },
      clickStage: () => {
        if (!graphState.current.selectedNodeId) {
          return;
        }
        graphState.current.selectedNodeId = null;
        removeHighlights();
      },
      enterNode: (event) => {
        graphState.current.selectedNodeId = null;
        highlightNode(event);
      },
      leaveNode: () => {
        if (graphState.current.selectedNodeId) {
          return;
        }
        removeHighlights();
      },
    });
  }, [highlightDepth, onTypeClick, registerEvents, sigma]);

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
