import "reactflow/dist/style.css";

import { Box, Stack, Typography } from "@mui/material";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect } from "react";
import type { Edge } from "reactflow";
import ReactFlow, {
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "reactflow";

import { CustomNode } from "./custom-node";
import type { CustomNodeType } from "./shared/types";
import type { StepGroup } from "@local/hash-isomorphic-utils/flows/types";

const nodeTypes = {
  action: CustomNode,
  "parallel-group": CustomNode,
  trigger: CustomNode,
};

const elk = new ELK();

const elkLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "100",
  "elk.padding": "[left=30, top=30]",
  "elk.direction": "RIGHT",
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

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  console.log({ group, nodes, edges });

  useEffect(() => {
    const graph: ElkNode = {
      id: group?.groupId.toString() ?? "root",
      layoutOptions: elkLayoutOptions,
      // @ts-expect-error –– mismatch between Elk and ReactFlow types
      children: initialNodes,
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

        window.requestAnimationFrame(() => fitView());
      });
  }, [fitView, group, initialEdges, initialNodes, setNodes, setEdges]);

  return (
    <Stack
      direction="row"
      sx={{
        borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
        py: 4,
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
      <Box sx={{ pl: 4, flexGrow: 1 }}>
        <ReactFlow
          key={group?.groupId ?? "root"}
          nodes={nodes}
          nodeTypes={nodeTypes}
          edges={edges}
          fitView
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
        />
      </Box>
    </Stack>
  );
};
