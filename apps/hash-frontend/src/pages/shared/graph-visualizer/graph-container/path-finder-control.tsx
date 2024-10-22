import { IconButton, IconDiagramNestedLight } from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { bidirectional, edgePathFromNodePath } from "graphology-shortest-path";
import { allSimplePaths } from "graphology-simple-path";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { SimpleAutocomplete } from "./path-finder-control/simple-autocomplete";
import {
  controlButtonSx,
  ControlPanel,
  ControlSectionContainer,
  ItemLabel,
} from "./shared/control-components";
import { useGraphContext } from "./shared/graph-context";
import { GraphVizNode } from "./shared/types";

type TypeData = {
  label: string;
  typeId: string;
  valueForSelector: string;
};

type NodeData = GraphVizNode & {
  disabled?: boolean;
  nodePathToNode?: string[];
  valueForSelector: string;
};

type TypesByTypeId = { [nodeTypeId: string]: TypeData };
type NodesByTypeId = { [nodeTypeId: string]: NodeData[] };

const PathTerminusSelector = ({
  label,
  node,
  nodeOptions,
  setNode,
  setType,
  type,
  typeOptions,
}: {
  label: "Start" | "End";
  node: NodeData | null;
  nodeOptions: NodeData[];
  setNode: (node: NodeData | null) => void;
  setType: (type: TypeData | null) => void;
  type: TypeData | null;
  typeOptions: TypeData[];
}) => {
  const lowercasedLabel = label.toLowerCase();

  return (
    <ControlSectionContainer
      label={label}
      tooltip={`Where the paths should ${lowercasedLabel}`}
    >
      <Stack gap={1}>
        <SimpleAutocomplete
          placeholder={`The type of node to ${lowercasedLabel} at`}
          options={typeOptions}
          setValue={setType}
          value={type}
        />
        <SimpleAutocomplete
          key={type?.typeId ?? "no-type"}
          placeholder={`The node to ${lowercasedLabel} at`}
          options={nodeOptions}
          setValue={setNode}
          value={node}
        />
      </Stack>
    </ControlSectionContainer>
  );
};

type Path = {
  edgePath: string[];
  label: string;
  valueForSelector: string;
};

const PathFinderPanel: FunctionComponent<{
  nodes: GraphVizNode[];
  open: boolean;
  onClose: () => void;
}> = ({ nodes, open, onClose }) => {
  const { config, filters, setGraphState } = useGraphContext();

  const sigma = useSigma();

  const { visibleNodesByTypeId, visibleTypesByTypeId } = useMemo(() => {
    const { includeByNodeTypeId } = filters;

    const visibleNodes: NodesByTypeId = {};
    const visibleTypes: TypesByTypeId = {};

    for (const node of nodes) {
      const { nodeTypeId, nodeTypeLabel, nodeId } = node;

      if (!node.nodeTypeId || !includeByNodeTypeId?.[node.nodeTypeId]) {
        continue;
      }

      if (nodeTypeId && nodeTypeLabel) {
        visibleTypes[nodeTypeId] ??= {
          label: nodeTypeLabel,
          typeId: nodeTypeId,
          valueForSelector: nodeTypeId,
        };

        visibleNodes[nodeTypeId] ??= [];
        visibleNodes[nodeTypeId].push({ ...node, valueForSelector: nodeId });
      }
    }

    return {
      visibleNodesByTypeId: visibleNodes,
      visibleTypesByTypeId: visibleTypes,
    };
  }, [filters, nodes]);

  const [startNode, setStartNode] = useState<NodeData | null>(null);
  const [startType, setStartType] = useState<TypeData | null>(
    config.pathfinding?.startTypeId
      ? (visibleTypesByTypeId[config.pathfinding.startTypeId] ?? null)
      : null,
  );
  const [endNode, setEndNode] = useState<NodeData | null>(null);
  const [endType, setEndType] = useState<TypeData | null>(
    config.pathfinding?.endTypeId
      ? (visibleTypesByTypeId[config.pathfinding.endTypeId] ?? null)
      : null,
  );

  const sortedTypes = useMemo(
    () =>
      Object.values(visibleTypesByTypeId).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [visibleTypesByTypeId],
  );

  const endNodeOptions = useMemo(() => {
    if (!endType) {
      return [];
    }

    const endNodes = visibleNodesByTypeId[endType.typeId] ?? [];

    for (const node of endNodes) {
      if (startNode) {
        const shortestPath = bidirectional(
          sigma.getGraph(),
          startNode.nodeId,
          node.nodeId,
        );

        let pathLength: string;
        if (shortestPath) {
          node.nodePathToNode = shortestPath;
          pathLength = shortestPath.length.toString();
        } else {
          pathLength = "None";
          node.disabled = true;
        }

        /**
         * replace the existing count if it exists, or add it if it doesn't
         */
        if (/\(.*\)$/.test(node.label)) {
          node.label = node.label.replace(/\(.*\)$/, `(${pathLength})`);
        } else {
          node.label = `${node.label} (${pathLength})`;
        }
      }
    }

    return endNodes;
  }, [endType, sigma, startNode, visibleNodesByTypeId]);

  const highlightPath = useCallback(
    (nodePath: string[] | null) => {
      if (!nodePath) {
        setGraphState("highlightedEdgePath", null);
        sigma.refresh({ skipIndexation: true });
        return;
      }

      const edgePath = edgePathFromNodePath(sigma.getGraph(), nodePath);

      setGraphState("highlightedEdgePath", edgePath);
      sigma.refresh({ skipIndexation: true });
    },
    [sigma, setGraphState],
  );

  const selectStartType = (type: TypeData | null) => {
    if (type !== startType) {
      setStartNode(null);
    }
    setStartType(type);
  };

  const selectEndType = (type: TypeData | null) => {
    if (type !== endType) {
      setEndNode(null);
    }
    setEndType(type);
  };

  const selectStartNode = (newStartNode: NodeData | null) => {
    if (newStartNode && endNode) {
      const shortestPath = bidirectional(
        sigma.getGraph(),
        newStartNode.nodeId,
        endNode.nodeId,
      );
      highlightPath(shortestPath);
    }
    setStartNode(newStartNode);
  };

  const selectEndNode = (newEndNode: NodeData | null) => {
    highlightPath(newEndNode?.nodePathToNode ?? null);
    setEndNode(newEndNode);
  };

  return (
    <ControlPanel
      onClose={onClose}
      open={open}
      position="left"
      title="Path finder"
    >
      <Stack direction="row" spacing={1} px={1.5} mt={1} sx={{ width: 500 }}>
        <PathTerminusSelector
          label="Start"
          node={startNode}
          nodeOptions={
            startType ? (visibleNodesByTypeId[startType.typeId] ?? []) : []
          }
          setNode={selectStartNode}
          setType={selectStartType}
          type={startType}
          typeOptions={sortedTypes}
        />
        <PathTerminusSelector
          label="End"
          node={endNode}
          nodeOptions={endNodeOptions}
          setNode={selectEndNode}
          setType={selectEndType}
          type={endType}
          typeOptions={sortedTypes}
        />
      </Stack>
      {/* <ControlSectionContainer */}
      {/*  label={"Paths"} */}
      {/*  tooltip={"Select the path to highlight"} */}
      {/* > */}
      {/*  <SimpleAutocomplete placeholder="Select path" options= setValue= value= */}
      {/* </ControlSectionContainer> */}
    </ControlPanel>
  );
};

export const PathFinderControl = ({ nodes }: { nodes: GraphVizNode[] }) => {
  const [pathFinderPanelOpen, setPathFinderPanelOpen] = useState(false);

  return (
    <>
      <PathFinderPanel
        nodes={nodes}
        open={pathFinderPanelOpen}
        onClose={() => setPathFinderPanelOpen(false)}
      />
      <IconButton
        onClick={() => setPathFinderPanelOpen(true)}
        sx={[controlButtonSx, { position: "absolute", top: 8, left: 8 }]}
      >
        <IconDiagramNestedLight />
      </IconButton>
    </>
  );
};
