import "reactflow/dist/style.css";

import type { StepGroup } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Fade, Stack, Typography } from "@mui/material";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo } from "react";
import type { Edge } from "reactflow";
import ReactFlow, {
  Background,
  BackgroundVariant,
  getNodesBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";

import { nodeTabHeight, parentGroupPadding } from "./shared/dimensions";
import {
  useFlowRunsContext,
  useStatusForSteps,
} from "./shared/flow-runs-context";
import type { CustomNodeType } from "./shared/types";
import { CustomEdge } from "./swimlane/custom-edge";
import { CustomNode } from "./swimlane/custom-node";
import { customColors } from "@hashintel/design-system/theme";
import { transitionOptions } from "./shared/styles";

const nodeTypes = {
  action: CustomNode,
  "parallel-group": CustomNode,
  trigger: CustomNode,
};

const edgeTypes = {
  "custom-edge": CustomEdge,
};

/**
 * @see https://eclipse.dev/elk/documentation/tooldevelopers
 * @see https://rtsys.informatik.uni-kiel.de/elklive/json.html for JSON playground
 */
const elk = new ELK();

const graphPadding = 30;

/**
 * @see https://eclipse.dev/elk/reference.html
 */
const elkLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.algorithm": "layered",
  "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.direction": "RIGHT",
  "elk.padding": `[left=${graphPadding},top=${graphPadding - nodeTabHeight.offset},right=${graphPadding},bottom=${graphPadding}]`,
};

const parentGroupLayoutOptions: ElkNode["layoutOptions"] = {
  ...elkLayoutOptions,
  "elk.padding": `[left=${parentGroupPadding.base}, top=${parentGroupPadding.top}, bottom=${parentGroupPadding.base}, right=${parentGroupPadding.base}]`,
};

type DagProps = {
  group?: StepGroup;
  nodes: CustomNodeType[];
  edges: Edge[];
};

type NodeWithChildren = CustomNodeType & { children: NodeWithChildren[] };

const flattedNodesToElkNodes = (
  allNodes: CustomNodeType[],
  parents: CustomNodeType[],
): NodeWithChildren[] => {
  return parents.map((parentNode) => ({
    ...parentNode,
    layoutOptions:
      parentNode.data.kind === "parallel-group"
        ? parentGroupLayoutOptions
        : undefined,
    children: flattedNodesToElkNodes(
      allNodes,
      allNodes.filter((node) => node.parentNode === parentNode.id),
    ),
  }));
};

const elkGraphToFlattenedPositionedNodes = (nodes: ElkNode[]): ElkNode[] => {
  return nodes.flatMap(({ children, ...node }) => [
    { ...node, position: { x: node.x, y: node.y } },
    ...elkGraphToFlattenedPositionedNodes(children ?? []),
  ]);
};

export const Swimlane = ({
  group,
  nodes: initialNodes,
  edges: initialEdges,
}: DagProps) => {
  const { fitView } = useReactFlow();

  const { selectedFlowRun } = useFlowRunsContext();

  const [nodes, setNodes, _onNodesChange] = useNodesState([]);
  const [edges, setEdges, _onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const childrenForElk = flattedNodesToElkNodes(
      initialNodes,
      initialNodes.filter((node) => !node.parentNode),
    );

    const graph: ElkNode = {
      id: group?.groupId.toString() ?? "root",
      // @ts-expect-error –– mismatch between Elk and ReactFlow types
      children: childrenForElk,
      // @ts-expect-error –– mismatch between Elk and ReactFlow types
      edges: initialEdges,
      layoutOptions: elkLayoutOptions,
    };

    void elk
      .layout(graph)
      .then(({ children }) => {
        return elkGraphToFlattenedPositionedNodes(children ?? []);
      })
      .then((laidOutElements) => {
        /** Reset the nodes to stop mismatch issues between old and new graph data, repeated ids etc, when switching flows */
        setNodes([]);
        setEdges([]);

        setTimeout(() => {
          // @ts-expect-error –– mismatch between Elk and ReactFlow types
          setNodes(laidOutElements);
          setEdges(initialEdges);
        }, 0);

        // window.requestAnimationFrame(() => fitView());
      });
  }, [fitView, group, initialEdges, initialNodes, setNodes, setEdges]);

  const bounds = useMemo(
    () => getNodesBounds(nodes.filter((node) => !node.parentNode)),
    [nodes],
  );

  const stepsWithIds = useMemo(
    () => nodes.map((node) => ({ stepId: node.id })),
    [nodes],
  );

  const groupStatus = useStatusForSteps(stepsWithIds);

  return (
    <Stack
      direction="row"
      sx={{
        background: ({ palette }) =>
          !selectedFlowRun
            ? palette.gray[10]
            : groupStatus === "Complete"
              ? "rgba(239, 254, 250, 1)"
              : groupStatus === "In Progress"
                ? palette.blue[10]
                : groupStatus === "Error"
                  ? palette.red[10]
                  : palette.common.white,
        "&:not(:last-of-type)": {
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
        },
        flex: 1,
        transition: ({ transitions }) =>
          transitions.create("background", transitionOptions),
      }}
    >
      <Stack
        direction="row"
        sx={({ palette }) => ({
          background: !selectedFlowRun ? "white" : "inherit",
          minWidth: 170,
          width: 170,
          pl: 3,
          pr: 4,
          py: 2.5,
          borderRight: `1px solid ${palette.gray[30]}`,
          transition: ({ transitions }) =>
            transitions.create("background", { duration: 100 }),
        })}
      >
        <Typography
          variant="smallCaps"
          sx={({ palette }) => ({
            color: palette.gray[50],
          })}
        >
          {group?.description ?? "Flow"}
        </Typography>
      </Stack>
      <Box
        sx={{
          flex: 1,
          height: bounds.height + graphPadding * 2 - nodeTabHeight.offset,
        }}
      >
        <ReactFlow
          key={group?.groupId ?? "root"}
          nodes={nodes}
          nodeTypes={nodeTypes}
          edges={edges}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          // fitView
          // onNodesChange={onNodesChange}
          // onEdgesChange={onEdgesChange}
        >
          <Fade in={!selectedFlowRun} timeout={transitionOptions.duration}>
            <div>
              <Background
                color={customColors.gray[50]}
                gap={4}
                style={{
                  borderTopRightRadius: 10,
                  borderBottomRightRadius: 10,
                }}
                variant={BackgroundVariant.Dots}
              />
            </div>
          </Fade>
        </ReactFlow>
      </Box>
    </Stack>
  );
};
