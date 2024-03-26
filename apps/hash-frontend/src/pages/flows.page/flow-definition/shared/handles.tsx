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
  stepDefinition,
}: Pick<NodeData, "stepDefinition">) => {
  const { outputs = [] } = stepDefinition;

  const inputs = stepDefinition.kind === "trigger" ? [] : stepDefinition.inputs;

  console.log({ stepDefinition, outputs, inputs });

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
