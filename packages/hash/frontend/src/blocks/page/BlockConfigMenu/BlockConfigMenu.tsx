import { useKey } from "rooks";

import { Checkbox, FormControlLabel, Popover, Typography } from "@mui/material";
import { VoidFunctionComponent } from "react";
import { bindPopover, PopupState } from "material-ui-popup-state/core";
import { JSONObject, JSONValue } from "blockprotocol";
import { BlockEntity } from "@hashintel/hash-shared/entity";

import { JsonSchema } from "../../../lib/json-utils";
import { TextField } from "../../../shared/ui/text-field";

const extractConfigPropertySchemas = (blockSchema: JsonSchema) =>
  Object.entries(blockSchema.properties ?? {}).filter(([name]) =>
    blockSchema.configProperties?.includes(name),
  );

const ConfigurationInput: VoidFunctionComponent<{
  name: string;
  schema: JsonSchema;
  value?: JSONValue | null;
}> = ({ name, schema: { type }, value }) => {
  switch (type) {
    case "boolean":
      return (
        <FormControlLabel
          control={
            <Checkbox
              onChange={(event) =>
                console.log("New value", name, event.target.value)
              }
              checked={typeof value === "boolean" ? value : false}
            />
          }
          label={name}
        />
      );

    case "string":
      return (
        <TextField
          label={name}
          onChange={(event) =>
            console.log("New value", name, event.target.value)
          }
          variant="outlined"
          value={value ?? ""}
        />
      );

    case "number":
      return (
        <TextField
          label={name}
          onChange={(event) =>
            console.log("New value", name, event.target.value)
          }
          type="number"
          variant="outlined"
          value={value ?? ""}
        />
      );

    default:
      throw new Error(`Property type ${type} config input not implemented`);
  }
};

type BlockConfigMenuProps = {
  blockData: BlockEntity | null;
  blockSchema?: JsonSchema | null;
  popupState: PopupState;
  updateConfig: () => void;
};

export const BlockConfigMenu: VoidFunctionComponent<BlockConfigMenuProps> = ({
  blockData,
  blockSchema,
  updateConfig,
  popupState,
}) => {
  useKey(["Escape"], () => {
    popupState.close();
  });

  const configProperties = extractConfigPropertySchemas(blockSchema ?? {});

  const entityData = blockData?.properties.entity.properties as
    | JSONObject
    | undefined;

  // console.log({ entityData, blockData });

  return (
    <Popover
      {...bindPopover(popupState)}
      sx={({ borderRadii, palette }) => ({
        borderRadius: borderRadii.lg,
        border: `1px solid ${palette.gray[30]}`,
        padding: 1,
      })}
      anchorOrigin={{
        horizontal: "left",
        vertical: "bottom",
      }}
      transformOrigin={{
        horizontal: "right",
        vertical: "top",
      }}
    >
      <Typography variant="smallTextLabels">Configure</Typography>
      {configProperties.map(([name, schema]) => (
        <ConfigurationInput
          key={name}
          name={name}
          schema={schema}
          value={entityData[name]}
        />
      ))}
      {!configProperties.length && "No block config properties available."}
    </Popover>
  );
};
