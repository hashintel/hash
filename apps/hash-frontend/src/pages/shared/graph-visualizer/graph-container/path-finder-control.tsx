import { IconButton, IconDiagramNestedLight } from "@hashintel/design-system";
import { Stack } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { dijkstra, edgePathFromNodePath } from "graphology-shortest-path";
import { allSimplePaths } from "graphology-simple-path";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";

import { SimpleAutocomplete } from "./shared/simple-autocomplete";
import {
  controlButtonSx,
  ControlPanel,
  ControlSectionContainer,
} from "./shared/control-components";
import { useGraphContext } from "./shared/graph-context";
import type { GraphVizNode } from "./shared/types";

type TypeData = {
  label: string;
  typeId: string;
  valueForSelector: string;
};

type NodeData = GraphVizNode & {
  disabled?: boolean;
  nodePathToNode?: string[];
  suffix?: string;
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
          includeSuffix={label === "End"}
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
  nodePath: string[];
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
        const shortestPath = dijkstra.bidirectional(
          sigma.getGraph(),
          startNode.nodeId,
          node.nodeId,
        );

        let pathLength: string;
        if (shortestPath.length > 0) {
          node.nodePathToNode = shortestPath;
          pathLength = (shortestPath.length - 1).toString();
        } else {
          pathLength = "None";
          node.disabled = true;
        }

        node.suffix = `(${pathLength})`;
      }
    }

    return endNodes;
  }, [endType, sigma, startNode, visibleNodesByTypeId]);

  const highlightPath = useCallback(
    (nodePath: string[] | null) => {
      if (!nodePath || nodePath.length === 0) {
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
      const shortestPath = dijkstra.bidirectional(
        sigma.getGraph(),
        newStartNode.nodeId,
        endNode.nodeId,
      );
      highlightPath(shortestPath);
    }
    setStartNode(newStartNode);
  };

  const [selectedSimplePath, _setSelectedSimplePath] = useState<Path | null>(
    null,
  );

  const setSelectedSimplePath = useCallback(
    (path: Path | null) => {
      _setSelectedSimplePath(path);
      if (path) {
        highlightPath(path.nodePath);
      }
    },
    [highlightPath],
  );

  const simplePaths = useMemo(() => {
    if (!startNode || !endNode) {
      return [];
    }

    const graph = sigma.getGraph();

    const unfilteredSimplePaths = allSimplePaths(
      graph,
      startNode.nodeId,
      endNode.nodeId,
      { maxDepth: 3 },
    );

    const pathOptions: Path[] = [];

    // eslint-disable-next-line no-labels
    pathsLoop: for (const path of unfilteredSimplePaths) {
      const seenTypes = new Set<string>();

      const labelParts: string[] = [];

      for (const nodeId of path) {
        const nodeData = graph.getNodeAttributes(nodeId);

        labelParts.push(nodeData.label);

        if (seenTypes.has(nodeData.nodeTypeId)) {
          /**
           * Even at maxDepth 3 there are hundreds of paths between any two nodes.
           * Excluding paths which travel through the same type of node twice is a simple way of cutting them down.
           */
          // eslint-disable-next-line no-labels
          continue pathsLoop;
        }
        seenTypes.add(nodeData.nodeTypeId);
      }

      const label = labelParts.join(" —> ");

      pathOptions.push({
        label,
        valueForSelector: label,
        nodePath: path,
      });
      setSelectedSimplePath(null);
    }

    return pathOptions;
  }, [startNode, endNode, setSelectedSimplePath, sigma]);

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
      <ControlSectionContainer
        label={`Simple paths${simplePaths.length ? ` (${simplePaths.length})` : ""}`}
        tooltip={`These are paths in which each node is of a different type, with a maximum of 3 edges followed.${!endNode || !startNode ? " Select a start and end node to see paths." : ""}`}
      >
        <SimpleAutocomplete
          key={`${startNode?.nodeId}-${endNode?.nodeId}`}
          placeholder="Select path to highlight"
          options={simplePaths}
          setValue={setSelectedSimplePath}
          value={selectedSimplePath}
        />
      </ControlSectionContainer>
    </ControlPanel>
  );
};

export const PathFinderControl = ({ nodes }: { nodes: GraphVizNode[] }) => {
  const { pathFinderPanelOpen, setPathFinderPanelOpen } = useGraphContext();

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
