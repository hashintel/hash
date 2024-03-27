import { Handle as BaseHandle, HandleProps, Position } from "reactflow";
import { Box, Typography } from "@mui/material";
import { NodeData } from "./types";

const CustomHandle = ({
  type,
  position,
  offset,
  name,
}: HandleProps & { offset: number; name: string }) => {
  return (
    <>
      <BaseHandle
        id={name}
        type={type}
        position={position}
        isValidConnection={(connection) => true}
        // onConnect={(params) => console.log("handle onConnect", params)}
        style={{ top: 10 + offset * 20 }}
      />
      <Typography
        sx={{
          fontSize: 10,
          position: "absolute",
          top: 2 + offset * 20,
          ...(type === "target" ? { left: 4 } : { right: 4 }),
        }}
      >
        {name}
      </Typography>
    </>
  );
};

export const Handles = ({
  inputSources,
  stepDefinition,
}: Pick<NodeData, "inputSources" | "stepDefinition">) => {
  if (!stepDefinition && inputSources.length === 0) {
    return null;
  }

  const { outputs = [] } = stepDefinition ?? {};

  const inputs =
    stepDefinition?.kind === "trigger"
      ? []
      : stepDefinition?.inputs ??
        /**
         * If we don't have any inputs on the step but we do have inputSources,
         * this is a parallel-group that refers to arbitrary inputs from other steps
         */
        inputSources.map((source) => ({
          name: source.inputName,
        }));

  return (
    <Box>
      {inputs.map((input, index) => (
        <CustomHandle
          key={input.name}
          name={input.name}
          offset={index}
          type="target"
          position={Position.Left}
        />
      ))}
      {outputs.map((output, index) => (
        <CustomHandle
          key={output.name}
          name={output.name}
          offset={index}
          type="source"
          position={Position.Right}
        />
      ))}
    </Box>
  );
};
