import { Handle as BaseHandle, HandleProps, Position } from "reactflow";
import { Box, Typography } from "@mui/material";
import { NodeData } from "./types";
import { useFlowDefinitionsContext } from "./flow-definitions-context";
import { useStatusForStep } from "./flow-runs-context";
import { useState } from "react";
import { Modal } from "../../../../shared/ui/modal";

type InputOrOutput = {
  array?: boolean;
  kind: "input" | "output";
  name: string;
  required?: boolean;
  source?: NodeData["inputSources"][number];
};

const CustomHandle = ({
  array,
  name,
  offset,
  onClick,
  position,
  required,
  source,
  type,
}: HandleProps & { offset: number; onClick: () => void } & InputOrOutput) => {
  const hardcodedValue = source?.kind === "hardcoded" ? source.value : null;

  return (
    <Box className="nodrag" sx={{ cursor: "pointer" }}>
      {!hardcodedValue && (
        <BaseHandle
          id={name}
          type={type}
          position={position}
          isValidConnection={(connection) => true}
          // onConnect={(params) => console.log("handle onConnect", params)}
          style={{
            top: 12 + offset * 20,
            right: -3,
            width: 7,
            height: 7,
            background: "green",
          }}
        />
      )}
      <Typography
        onClick={onClick}
        sx={({ palette, transitions }) => ({
          fontSize: 12,
          position: "absolute",
          top: 4 + offset * 25,
          ...(type === "target" ? { left: 3 } : { right: 3 }),
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: 1,
          px: 1,
          height: 18,
          "&:hover": {
            border: `1px solid ${palette.gray[60]}`,
          },
          transition: transitions.create("border"),
        })}
      >
        {name}
        {array ? "[]" : ""}
      </Typography>
    </Box>
  );
};

export const Handles = ({
  inputSources,
  stepDefinition,
}: Pick<NodeData, "inputSources" | "stepDefinition">) => {
  const { direction } = useFlowDefinitionsContext();

  const stepStatus = useStatusForStep();

  const [selectedProperty, setSelectedProperty] =
    useState<InputOrOutput | null>(null);

  if (!stepDefinition && inputSources.length === 0) {
    return null;
  }

  const { outputs = [] } = stepDefinition ?? {};

  const inputs: InputOrOutput[] = [];

  if (stepDefinition?.kind !== "trigger") {
    for (const input of stepDefinition?.inputs ?? []) {
      const existingSource = inputSources.find(
        (source) => source.inputName === input.name,
      );

      inputs.push({
        name: input.name,
        array: input.array,
        kind: "input",
        required: input.required,
        source: existingSource,
      });
    }

    for (const source of inputSources) {
      if (!inputs.some((input) => input.name === source.inputName)) {
        inputs.push({
          name: source.inputName,
          kind: "input",
          source,
        });
      }
    }
  }

  console.log({ selectedProperty });

  return (
    <>
      {selectedProperty && (
        <Modal open onClose={() => setSelectedProperty(null)}>
          <Typography sx={{ fontWeight: 600 }}>
            {selectedProperty.name}
          </Typography>
          <Typography sx={{ mt: 2 }}>
            Kind: {selectedProperty.payloadKind}
          </Typography>
        </Modal>
      )}
      <Box>
        {inputs.map((input, index) => (
          <CustomHandle
            key={input.name}
            offset={index}
            onClick={() => setSelectedProperty(input)}
            type="target"
            position={direction === "RIGHT" ? Position.Left : Position.Top}
            {...input}
          />
        ))}
        {outputs.map((output, index) => (
          <CustomHandle
            key={output.name}
            offset={index}
            onClick={() => setSelectedProperty(output)}
            type="source"
            position={direction === "RIGHT" ? Position.Right : Position.Bottom}
            {...output}
          />
        ))}
      </Box>
    </>
  );
};
