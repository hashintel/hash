import { Typography } from "@mui/material";
import type { NodeProps } from "reactflow";

import { NodeContainer } from "./shared/node-container";
import type { NodeData } from "./shared/types";
import { Handles } from "./shared/handles";

export const CustomNode = ({
  data,
  selected,
  ...rest
}: NodeProps<NodeData>) => {
  console.log(data.label, { data, rest });

  return (
    <NodeContainer selected={selected}>
      <Typography sx={{ mx: 4, textAlign: "center", fontSize: 14 }}>
        {data.label}
      </Typography>
      <Handles
        inputSources={data.inputSources}
        stepDefinition={data.stepDefinition}
      />
    </NodeContainer>
  );
};
