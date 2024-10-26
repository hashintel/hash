import {
  IconButton,
  IconDiagramNestedLight,
  Select,
} from "@hashintel/design-system";
import { Box, Stack, Switch } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { dijkstra, edgePathFromNodePath } from "graphology-shortest-path";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MenuItem } from "../../../../shared/ui/menu-item";
import type {
  GenerateSimplePathsRequestMessage,
  GenerateSimplePathsResultMessage,
  NodeData,
  Path,
  SimplePathSort,
} from "./path-finder-control/types";
import { simplePathSorts } from "./path-finder-control/types";
import {
  controlButtonSx,
  ControlPanel,
  ControlSectionContainer,
  ItemLabel,
} from "./shared/control-components";
import { useGraphContext } from "./shared/graph-context";
import { IntegerInput } from "./shared/integer-input";
import { SimpleAutocomplete } from "./shared/simple-autocomplete";
import { selectSx } from "./shared/styles";
import type { GraphVizNode } from "./shared/types";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

type TypeData = {
  label: string;
  typeId: string;
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
  suffixKey,
  type,
  typeOptions,
}: {
  label: "Start at" | "End at" | "Go via";
  node: NodeData | null;
  nodeOptions: NodeData[];
  setNode: (node: NodeData | null) => void;
  setType: (type: TypeData | null) => void;
  suffixKey?: "shortestPathTo" | "shortestPathVia";
  type: TypeData | null;
  typeOptions: TypeData[];
}) => {
  const lowercasedLabel = label.toLowerCase();

  return (
    <ControlSectionContainer
      label={label}
      tooltip={`Where the path should ${lowercasedLabel}`}
    >
      <Stack gap={1}>
        <SimpleAutocomplete
          placeholder={`Which type to ${lowercasedLabel}`}
          options={typeOptions}
          setValue={setType}
          value={type}
        />
        <SimpleAutocomplete
          key={type?.typeId ?? "no-type"}
          placeholder={`Which node to ${lowercasedLabel}`}
          options={nodeOptions}
          setValue={setNode}
          suffixKey={suffixKey}
          value={node}
        />
      </Stack>
    </ControlSectionContainer>
  );
};

const generatePathKey = ({
  from,
  to,
  via,
}: {
  from: string;
  to: string;
  via?: string;
}) => `${from}-${to}-${via}`;

const PathFinderPanel: FunctionComponent<{
  nodes: GraphVizNode[];
  open: boolean;
  onClose: () => void;
}> = ({ nodes, open, onClose }) => {
  const { config, filters, setGraphState, graphContainerRef } =
    useGraphContext();

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
  const [endType, setEndType] = useState<TypeData | null>(null);

  const [viaNode, setViaNode] = useState<NodeData | null>(null);
  const [viaType, setViaType] = useState<TypeData | null>(null);

  const [maxSimplePathDepth, setMaxSimplePathDepth] = useState(3);
  const [allowRepeatedNodeTypes, setAllowRepeatedNodeTypes] = useState(false);
  const [simplePathSort, setSimplePathSort] =
    useState<SimplePathSort>("Significance");

  const [simplePaths, setSimplePaths] = useState<Path[]>([]);
  const [selectedSimplePath, _setSelectedSimplePath] = useState<Path | null>(
    null,
  );
  const [waitingSimplePathResult, setWaitingSimplePathResult] = useState(false);

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

  const setSelectedSimplePath = useCallback(
    (path: Path | null) => {
      _setSelectedSimplePath(path);
      if (path) {
        highlightPath(path.nodePath);
      }
    },
    [highlightPath],
  );

  const worker = useMemo(
    () =>
      new Worker(new URL("./path-finder-control/worker.ts", import.meta.url)),
    [],
  );

  useEffect(() => {
    worker.onmessage = ({ data }) => {
      if (
        "type" in data &&
        data.type ===
          ("generateSimplePathsResult" satisfies GenerateSimplePathsResultMessage["type"])
      ) {
        setSimplePaths((data as GenerateSimplePathsResultMessage).result);
        setWaitingSimplePathResult(false);
      }
      return () => worker.terminate();
    };
  }, [worker]);

  useEffect(() => {
    if (!startNode || !endNode) {
      setSimplePaths([]);
      return;
    }

    setWaitingSimplePathResult(true);
    const request: GenerateSimplePathsRequestMessage = {
      type: "generateSimplePaths",
      params: {
        allowRepeatedNodeTypes,
        endNode,
        graph: sigma.getGraph().export(),
        maxSimplePathDepth,
        simplePathSort,
        startNode,
        viaNode,
      },
    };

    worker.postMessage(request);
  }, [
    allowRepeatedNodeTypes,
    endNode,
    maxSimplePathDepth,
    simplePathSort,
    sigma,
    startNode,
    viaNode,
    worker,
  ]);

  const sortedTypes = useMemo(
    () =>
      Object.values(visibleTypesByTypeId).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [visibleTypesByTypeId],
  );

  const { endNodeOptions, viaNodeOptions } = useMemo(() => {
    const endNodes = endType
      ? (visibleNodesByTypeId[endType.typeId] ?? [])
      : [];
    const viaNodes = viaType
      ? (visibleNodesByTypeId[viaType.typeId] ?? [])
      : [];

    const shortestPathByKey: { [key: string]: string[] | null } = {};

    if (startNode) {
      for (const node of endNodes) {
        let shortestPath: string[] | null = null;
        if (viaNode) {
          const firstPart = dijkstra.bidirectional(
            sigma.getGraph(),
            startNode.nodeId,
            node.nodeId,
          ) as string[] | null; // library types are wrong, might be null
          const secondPart = dijkstra.bidirectional(
            sigma.getGraph(),
            node.nodeId,
            viaNode.nodeId,
          ) as string[] | null; // library types are wrong, might be null
          shortestPath =
            firstPart && secondPart
              ? firstPart.concat(secondPart.slice(1))
              : null;

          const pathKey = generatePathKey({
            from: startNode.nodeId,
            to: viaNode.nodeId,
            via: node.nodeId,
          });
          shortestPathByKey[pathKey] = shortestPath;

          if (shortestPath) {
            node.nodePathToHighlight = shortestPath;
          }
        } else {
          shortestPath = dijkstra.bidirectional(
            sigma.getGraph(),
            startNode.nodeId,
            node.nodeId,
          );
        }

        let pathLength: string;
        if (shortestPath && shortestPath.length > 0) {
          node.nodePathToHighlight = shortestPath;
          pathLength = (shortestPath.length - 1).toString();
        } else {
          pathLength = "None";
          node.disabled = true;
        }

        node.shortestPathTo = `(${pathLength})`;
      }

      if (endNode) {
        for (const node of viaNodes) {
          let shortestPath: string[] | null | undefined =
            shortestPathByKey[
              generatePathKey({
                from: startNode.nodeId,
                to: endNode.nodeId,
                via: node.nodeId,
              })
            ];

          if (!shortestPath) {
            const firstPart = dijkstra.bidirectional(
              sigma.getGraph(),
              startNode.nodeId,
              node.nodeId,
            ) as string[] | null;
            const secondPart = dijkstra.bidirectional(
              sigma.getGraph(),
              node.nodeId,
              endNode.nodeId,
            ) as string[] | null;
            shortestPath =
              firstPart && secondPart
                ? firstPart.concat(secondPart.slice(1))
                : null;
          }

          let pathLength: string;
          if (shortestPath && shortestPath.length > 0) {
            node.nodePathToHighlight = shortestPath;
            pathLength = (shortestPath.length - 1).toString();
          } else {
            pathLength = "None";
            node.disabled = true;
          }

          node.shortestPathVia = `(${pathLength})`;
        }
      }
    }

    return { endNodeOptions: endNodes, viaNodeOptions: viaNodes };
  }, [
    endNode,
    endType,
    sigma,
    startNode,
    viaNode,
    viaType,
    visibleNodesByTypeId,
  ]);

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

  const selectViaType = (type: TypeData | null) => {
    if (type !== viaType) {
      setViaNode(null);
    }
    setViaType(type);
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

  const selectEndNode = (newEndNode: NodeData | null) => {
    highlightPath(newEndNode?.nodePathToHighlight ?? null);
    setSelectedSimplePath(null);
    setEndNode(newEndNode);
  };

  const selectViaNode = (newViaNode: NodeData | null) => {
    highlightPath(newViaNode?.nodePathToHighlight ?? null);
    setSelectedSimplePath(null);
    setViaNode(newViaNode);
  };

  return (
    <ControlPanel
      onClose={onClose}
      open={open}
      position="left"
      title="Path finder"
    >
      <Stack direction="row" spacing={1} px={1.5} mt={1} sx={{ width: 700 }}>
        <PathTerminusSelector
          label="Start at"
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
          label="End at"
          node={endNode}
          nodeOptions={endNodeOptions}
          setNode={selectEndNode}
          setType={selectEndType}
          suffixKey="shortestPathTo"
          type={endType}
          typeOptions={sortedTypes}
        />
        <PathTerminusSelector
          label="Go via"
          suffixKey="shortestPathVia"
          node={viaNode}
          nodeOptions={viaNodeOptions}
          setNode={selectViaNode}
          setType={selectViaType}
          type={viaType}
          typeOptions={sortedTypes}
        />
      </Stack>
      <ControlSectionContainer
        label={`Simple paths${simplePaths.length ? ` (${formatNumber(simplePaths.length)})` : ""}`}
        tooltip={`These are paths in which no node is visited twice.${!endNode || !startNode ? " Select a start and end node to see paths." : ""}`}
      >
        <SimpleAutocomplete
          disabled={waitingSimplePathResult}
          key={`${startNode?.nodeId}-${endNode?.nodeId}-${viaNode?.nodeId}-${maxSimplePathDepth}-${allowRepeatedNodeTypes}-${simplePathSort}`}
          placeholder={
            waitingSimplePathResult
              ? "Finding simple paths..."
              : simplePaths.length
                ? "Select path to highlight"
                : !(startNode && endNode)
                  ? "Select a start and end node"
                  : "No paths found"
          }
          options={simplePaths}
          setValue={setSelectedSimplePath}
          sortAlphabetically={false}
          value={selectedSimplePath}
        />
        <Stack direction="row" gap={2} mt={1}>
          <Box sx={{ width: 90 }}>
            <ItemLabel tooltip="The maximum depth of paths to find. Highly connected graphs can result in a LOT of paths at higher depths.">
              Max depth
            </ItemLabel>
            <IntegerInput
              value={maxSimplePathDepth}
              setValue={(newValue) => {
                setMaxSimplePathDepth(newValue);
                setSelectedSimplePath(null);
              }}
              width={80}
            />
          </Box>
          <Box>
            <ItemLabel tooltip="How to sort the simple path options">
              Sort
            </ItemLabel>
            <Select
              value={simplePathSort}
              onChange={(event) => {
                setSimplePathSort(event.target.value as SimplePathSort);
                setSelectedSimplePath(null);
              }}
              MenuProps={{
                container: graphContainerRef.current,
              }}
              sx={selectSx}
            >
              {simplePathSorts.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <Box sx={{ width: 100 }}>
            <ItemLabel tooltip="Whether to allow the path to contain multiple nodes of the same type.">
              Repeat types
            </ItemLabel>
            <Switch
              checked={allowRepeatedNodeTypes}
              onChange={() => {
                setAllowRepeatedNodeTypes(!allowRepeatedNodeTypes);
                setSelectedSimplePath(null);
              }}
              size="small"
            />
          </Box>
        </Stack>
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
