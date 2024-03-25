import { Typography } from "@mui/material";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";

import { NodeContainer } from "./shared/node-container";
import type { NodeData } from "./shared/types";

export const ActionNode = ({ data, selected }: NodeProps<NodeData>) => {
  return (
    <NodeContainer selected={selected}>
      <Typography>{data.label}</Typography>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </NodeContainer>
  );
};
