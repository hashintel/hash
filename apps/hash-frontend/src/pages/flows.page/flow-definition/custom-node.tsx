import { Typography } from "@mui/material";
import type { NodeProps } from "reactflow";

import { Handles } from "./shared/handles";
import { NodeContainer } from "./shared/node-container";
import type { NodeData } from "./shared/types";

export const CustomNode = ({
  data,
  selected,
  ...rest
}: NodeProps<NodeData>) => {
  const isParallel = data.inputSources.find(
    (input) => input.kind === "parallel-group-input",
  );

  return (
    <NodeContainer selected={selected}>
      <Typography
        sx={{ mx: 3, textAlign: "center", fontSize: 12, fontWeight: 600 }}
      >
        {data.label}
        {isParallel ? "[]" : ""}
      </Typography>
      <Handles
        inputSources={data.inputSources}
        stepDefinition={data.stepDefinition}
      />
    </NodeContainer>
  );
};
