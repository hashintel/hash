import { Handle, Handle as BaseHandle, HandleProps, Position } from "reactflow";
import { Box, Typography } from "@mui/material";
import { NodeData } from "../shared/types";
import { useFlowDefinitionsContext } from "../shared/flow-definitions-context";
import { useStatusForStep } from "../shared/flow-runs-context";
import { useState } from "react";
import { Modal } from "../../../../shared/ui/modal";
import { customColors } from "@hashintel/design-system/theme";
import { StepStatusName } from "./styles";

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
  stepStatusName,
}: Pick<NodeData, "inputSources" | "stepDefinition"> & {
  stepStatusName: StepStatusName;
}) => {
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

  const showAllDependencies = false;

  let handleColor = customColors.gray[30];
  switch (stepStatusName) {
    case "Complete":
      handleColor = customColors.green[70];
      break;
    case "In Progress":
      handleColor = customColors.blue[70];
      break;
    case "Error":
      handleColor = customColors.red[70];
      break;
  }

  const handleStyle = {
    width: 12,
    height: 12,
    background: "white",
    border: `1px solid ${handleColor}`,
  };

  if (!showAllDependencies) {
    return (
      <>
        {!!inputs.length && (
          <Handle
            type="target"
            position={Position.Left}
            style={{ ...handleStyle, left: -6 }}
          />
        )}
        {(!!outputs.length || stepDefinition?.kind === "trigger") && (
          <Handle
            type="source"
            position={Position.Right}
            style={{ ...handleStyle, right: -6 }}
          />
        )}
      </>
    );
  }

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
