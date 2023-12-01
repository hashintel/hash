import { Box, TextField } from "@mui/material";
import { FunctionComponent } from "react";
import { useFormContext } from "react-hook-form";

import { ChartDefinition } from "../types/chart-definition";

export const GraphChartDefinitionForm: FunctionComponent = () => {
  const { register } = useFormContext<ChartDefinition<"graph-chart">>();

  return (
    <Box>
      <TextField
        id="incoming-links-depth"
        fullWidth
        type="number"
        label="Incoming Links Depth"
        /** @todo: figure out why the label isn't shrinking when the value is updated programmatically */
        InputLabelProps={{ shrink: true }}
        {...register("incomingLinksDepth", {
          setValueAs: (value) => parseInt(value as string, 10),
        })}
      />
      <TextField
        id="outgoing-links-depth"
        fullWidth
        type="number"
        label="Outgoing Links Depth"
        /** @todo: figure out why the label isn't shrinking when the value is updated programmatically */
        InputLabelProps={{ shrink: true }}
        {...register("outgoingLinksDepth", {
          setValueAs: (value) => parseInt(value as string, 10),
        })}
      />
    </Box>
  );
};
