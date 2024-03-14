import { Box, TextField } from "@mui/material";
import type { FunctionComponent } from "react";
import { useFormContext } from "react-hook-form";

import type { ChartDefinition } from "../types/chart-definition";

const minDepth = 0;
const maxDepth = 255;

export const GraphChartDefinitionForm: FunctionComponent = () => {
  const { register } = useFormContext<ChartDefinition<"graph-chart">>();

  return (
    <Box>
      <TextField
        id="incoming-links-depth"
        fullWidth
        type="number"
        label="Incoming Links Depth"
        InputProps={{ inputProps: { min: minDepth, max: maxDepth } }}
        {...register("incomingLinksDepth", {
          setValueAs: (value) => parseInt(value as string, 10),
        })}
      />
      <TextField
        id="outgoing-links-depth"
        fullWidth
        type="number"
        label="Outgoing Links Depth"
        InputProps={{ inputProps: { min: minDepth, max: maxDepth } }}
        {...register("outgoingLinksDepth", {
          setValueAs: (value) => parseInt(value as string, 10),
        })}
      />
    </Box>
  );
};
