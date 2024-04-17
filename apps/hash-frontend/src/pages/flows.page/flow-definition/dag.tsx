import "reactflow/dist/style.css";

import { Box, Stack, Typography } from "@mui/material";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { Edge } from "reactflow";
import ReactFlow, {
  getNodesBounds,
  getViewportForBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";

import { CustomNode } from "./custom-node";
import type { CustomNodeType } from "./shared/types";
import type { StepGroup } from "@local/hash-isomorphic-utils/flows/types";
import { parentGroupPadding } from "./shared/dimensions";

const nodeTypes = {
  action: CustomNode,
  "parallel-group": CustomNode,
  trigger: CustomNode,
};

const elk = new ELK();

const elkLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.layered.nodePlacement.strategy": "SIMPLE",
  "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "100",
  // "elk.spacing.nodeNode": "100",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INHERIT",
  "elk.padding": "[left=0,top=0,right=0,bottom=0]",
};

const parentGroupLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.padding": `[left=${parentGroupPadding.left}, top=${parentGroupPadding.top}, bottom=100, right=100]`,
};

type DagProps = {
  group?: StepGroup;
  nodes: CustomNodeType[];
  edges: Edge[];
};

export const DAG = ({
  group,
  nodes: initialNodes,
  edges: initialEdges,
}: DagProps) => {
  const { fitView } = useReactFlow();

  const [nodes, setNodes, _onNodesChange] = useNodesState([]);
  const [edges, setEdges, _onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const graph: ElkNode = {
      id: group?.groupId.toString() ?? "root",
      layoutOptions: elkLayoutOptions,
      // @ts-expect-error –– mismatch between Elk and ReactFlow types
      children: initialNodes.map((node) => ({
        ...node,
        layoutOptions: parentGroupLayoutOptions,
      })),
      // @ts-expect-error –– mismatch between Elk and ReactFlow types
      edges: initialEdges,
    };

    void elk
      .layout(graph)
      .then(({ children }) => {
        return (children ?? []).map((node) => ({
          ...node,
          position: { x: node.x, y: node.y },
        }));
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

  console.log({ nodes });

  return (
    <Stack
      direction="row"
      sx={{
        borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
        py: 2.5,
        px: 3,
        flex: 1,
      }}
    >
      <Box
        sx={({ palette }) => ({
          width: 170,
          pr: 4,
          borderRight: `1px solid ${palette.gray[30]}`,
        })}
      >
        <Typography
          variant="smallCaps"
          sx={({ palette }) => ({
            color: palette.gray[50],
            lineHeight: 1,
          })}
        >
          {group?.description ?? "Flow"}
        </Typography>
      </Box>
      <Box sx={{ pl: 4, width: "100%", height: bounds.height }}>
        <ReactFlow
          key={group?.groupId ?? "root"}
          nodes={nodes}
          nodeTypes={nodeTypes}
          edges={edges}
          // fitView
          // onNodesChange={onNodesChange}
          // onEdgesChange={onEdgesChange}
        />
      </Box>
    </Stack>
  );
};
