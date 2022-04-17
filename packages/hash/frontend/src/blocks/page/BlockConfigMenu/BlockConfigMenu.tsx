import { useKey } from "rooks";
import { get } from "lodash";

import {
  Checkbox,
  FormControlLabel,
  Box,
  Typography,
  MenuItem,
  Popover,
} from "@mui/material";
import {
  ChangeEvent,
  ForwardedRef,
  useEffect,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { JSONObject, JSONValue } from "blockprotocol";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";
import { bindPopover, PopupState } from "material-ui-popup-state/hooks";

import { TextField } from "../../../shared/ui/text-field";

const extractConfigPropertySchemas = (blockSchema: JsonSchema) =>
  Object.entries(blockSchema.properties ?? {}).filter(([name]) =>
    blockSchema.configProperties?.includes(name),
  );

const resolvePropertySchema = ($ref: string, rootSchema: JsonSchema) => {
  if ($ref.startsWith("#/")) {
    const deepObjectPath = $ref.split("/").slice(1).join(".");
    return get(rootSchema, deepObjectPath);
  }
  throw new Error(`Resolution of external schema ${$ref} not yet implemented.`);
};

/**
 * This is a temporary implementation of 'provide an input based on a property schema'
 * We will need a more comprehensive implementation for the full entity editor
 */
const ConfigurationInput: VoidFunctionComponent<{
  name: string;
  onChange: (value: any) => void;
  rootSchema: JsonSchema;
  propertySchema: JsonSchema;
  value?: JSONValue | null;
}> = ({ name, onChange, propertySchema, rootSchema, value }) => {
  const resolvedPropertySchema = propertySchema.$ref
    ? resolvePropertySchema(propertySchema.$ref, rootSchema)
    : propertySchema;
  const { enum: enumList, format, type } = resolvedPropertySchema;

  const updateProperty = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => onChange(event.target.value);

  const [draftValue, setDraftValue] = useState(value);

  const previousValue = useRef<JSONValue | undefined>(undefined);
  useEffect(() => {
    previousValue.current = value;
    console.log({ value });
  });

  if (previousValue.current !== value && value !== draftValue) {
    console.log({ value, draftValue });
    setDraftValue(value);
  }

  console.log({ previousValue: previousValue.current, value, draftValue });

  switch (type) {
    case "boolean":
      return (
        <FormControlLabel
          control={
            <Checkbox
              onChange={updateProperty}
              checked={typeof value === "boolean" ? value : false}
            />
          }
          label={name}
        />
      );

    case "string":
      if (format) {
        // @todo validate string format - should have a reusable input that does this
      }
      return (
        <TextField
          label={name}
          onBlur={enumList ? undefined : updateProperty}
          onChange={(event) => {
            setDraftValue(event.target.value);
            if (enumList) {
              updateProperty(event);
            }
          }}
          select={!!enumList}
          value={draftValue}
          variant="outlined"
        >
          {(enumList ?? []).map((option: string) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      );

    case "number":
      return (
        <TextField
          defaultValue={value ?? ""}
          onBlur={(event) => onChange(event.target.value)}
          onChange={(event) => setDraftValue(event.target.value)}
          type="number"
          value={draftValue}
          variant="outlined"
        />
      );

    default:
      throw new Error(`Property type ${type} config input not implemented`);
  }
};

type BlockConfigMenuProps = {
  anchorRef: ForwardedRef<HTMLDivElement>;
  blockData: BlockEntity | null;
  blockSchema?: JsonSchema | null;
  closeMenu: () => void;
  popupState: PopupState;
  updateConfig: (propertiesToUpdate: JSONObject) => void;
};

/**
 * Provides a generic UI for setting properties on the entity a block is rendering.
 * Useful for when the block doesn't provide the UI to do so itself.
 * Only the properties listed in the block's schema as 'configProperties' are shown.
 */
export const BlockConfigMenu: VoidFunctionComponent<BlockConfigMenuProps> = ({
  anchorRef,
  blockData,
  blockSchema,
  closeMenu,
  popupState,
  updateConfig,
}) => {
  useKey(["Escape"], closeMenu);

  const configProperties = extractConfigPropertySchemas(blockSchema ?? {});

  const entityData = blockData?.properties.entity.properties as
    | JSONObject
    | undefined;

  if (anchorRef && typeof anchorRef === "function") {
    throw new Error(
      "BlockConfigMenu requires an element attached to anchorRef.current, to anchor the menu to.",
    );
  }

  return (
    <Popover
      {...bindPopover(popupState)}
      anchorEl={anchorRef?.current}
      PaperProps={{ sx: { padding: 2 } }}
    >
      <Typography variant="h5">Configure block</Typography>
      {configProperties.map(([name, schema]) => (
        <Box key={name} sx={{ mt: 2 }}>
          <ConfigurationInput
            name={name}
            onChange={(value: any) => updateConfig({ [name]: value })}
            rootSchema={blockSchema ?? {}}
            propertySchema={schema}
            value={entityData?.[name]}
          />
        </Box>
      ))}
      {!configProperties.length && (
        <Box sx={{ mt: 2 }}>No block config properties available.</Box>
      )}
    </Popover>
  );
};
