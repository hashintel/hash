import { Box, Typography } from "@mui/material";
import { useState } from "react";
import type { HandleProps } from "reactflow";
import { Handle as BaseHandle, Handle, Position } from "reactflow";

import { Modal } from "../../../../../shared/ui/modal";
import { nodeDimensions, nodeTabHeight } from "../../shared/dimensions";
import type { SimpleStatus } from "../../shared/flow-runs-context";
import type { NodeData } from "../../shared/types";
import { edgeColor } from "../shared/edge-styles";

type InputOrOutputBase = {
  array?: boolean;
  kind: "input" | "output";
  name: string;
  required?: boolean;
};

type Input = InputOrOutputBase & {
  kind: "input";
  source?: NodeData["inputSources"][number];
};

type Output = InputOrOutputBase & {
  kind: "output";
  source?: null;
};

type InputOrOutput = Input | Output;

const CustomHandle = ({
  array,
  name,
  offset,
  onClick,
  position,
  source,
  type,
}: HandleProps & { offset: number; onClick: () => void } & InputOrOutput) => {
  const hardcodedValue =
    source?.kind === "hardcoded" ? source.payload.value : null;

  return (
    <Box className="nodrag" sx={{ cursor: "pointer" }}>
      {!hardcodedValue && (
        <BaseHandle
          id={name}
          type={type}
          position={position}
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

const halfContentHeight = (nodeDimensions.height - nodeTabHeight.gross) / 2;

export const Handles = ({
  kind,
  inputSources,
  actionDefinition,
  stepStatusName,
}: Pick<NodeData, "kind" | "inputSources" | "actionDefinition"> & {
  stepStatusName: SimpleStatus;
}) => {
  const [selectedProperty, setSelectedProperty] =
    useState<InputOrOutput | null>(null);

  if (!actionDefinition && inputSources.length === 0) {
    return null;
  }

  const showAllDependencies = false;

  const outputs: Output[] = (actionDefinition?.outputs ?? []).map(
    ({ array, name, required }) => ({
      array,
      kind: "output",
      name,
      required,
    }),
  );

  const inputs: Input[] = [];

  for (const input of actionDefinition?.inputs ?? []) {
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

  if (kind === "parallel-group") {
    /**
     * A parallel group has no action definition, but does have inputSources
     */
    for (const source of inputSources) {
      inputs.push({
        name: source.inputName,
        kind: "input",
        source,
      });
    }
  }

  const handleStyle = {
    width: 12,
    height: 12,
    background: "white",
    border: `1px solid ${edgeColor[stepStatusName]}`,
    top: halfContentHeight,
    transition: "border 0.2s ease-in-out",
  };

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- toggling to be added in follow up
  if (!showAllDependencies) {
    return (
      <>
        {!!inputs.length && (
          <Handle
            type="target"
            position={Position.Left}
            style={{
              ...handleStyle,
              visibility: "hidden",
              left: -6,
            }}
          />
        )}
        {!!outputs.length && (
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
        </Modal>
      )}
      <Box>
        {inputs.map((input, index) => (
          <CustomHandle
            key={input.name}
            offset={index}
            onClick={() => setSelectedProperty(input)}
            type="target"
            position={Position.Left}
            {...input}
          />
        ))}
        {outputs.map((output, index) => (
          <CustomHandle
            key={output.name}
            offset={index}
            onClick={() => setSelectedProperty(output)}
            type="source"
            position={Position.Right}
            {...output}
          />
        ))}
      </Box>
    </>
  );
};
