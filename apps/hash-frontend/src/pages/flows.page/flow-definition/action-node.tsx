import { Typography } from "@mui/material";
import type { NodeProps } from "reactflow";

import { NodeContainer } from "./shared/node-container";
import type { NodeData } from "./shared/types";
import { Handles } from "./shared/handles";

export const ActionNode = ({ data, selected }: NodeProps<NodeData>) => {
  return (
    <NodeContainer selected={selected}>
      <Typography sx={{ mx: 4, textAlign: "center", fontSize: 14 }}>
        {data.label}
      </Typography>
      <Handles stepDefinition={data.stepDefinition} />
    </NodeContainer>
  );
};
