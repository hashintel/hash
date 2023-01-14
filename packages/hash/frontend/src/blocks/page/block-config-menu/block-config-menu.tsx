import { JsonObject, JsonValue } from "@blockprotocol/core";
import { TextField } from "@local/hash-design-system";
import { BlockEntity } from "@local/hash-shared/entity";
import { JsonSchema } from "@local/hash-shared/json-utils";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Popover,
  Typography,
} from "@mui/material";
import { get } from "lodash";
import { bindPopover, PopupState } from "material-ui-popup-state/hooks";
import {
  ChangeEvent,
  ForwardedRef,
  FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useKey } from "rooks";

import { MenuItem } from "../../../shared/ui";

const extractConfigPropertySchemas = (
  blockSchema: JsonSchema,
): [string, JsonSchema][] =>
  Object.entries(blockSchema.properties ?? {}).filter(([name]) =>
    blockSchema.configProperties?.includes(name),
  );

const resolvePropertySchema = (
  $ref: string,
  rootSchema: JsonSchema,
): JsonSchema => {
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
const ConfigurationInput: FunctionComponent<{
  name: string;
  onChange: (value: any) => void;
  rootSchema: JsonSchema;
  propertySchema: JsonSchema;
  value?: JsonValue | null;
}> = ({ name, onChange, propertySchema, rootSchema, value }) => {
  const resolvedPropertySchema = propertySchema.$ref
    ? resolvePropertySchema(propertySchema.$ref, rootSchema)
    : propertySchema;
  const { enum: enumList, format, type } = resolvedPropertySchema;

  const updateProperty = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { value: newValue } = event.target;
    // If a type is a number or an array that accepts a number, convert to a number
    if (
      type === "number" ||
      (Array.isArray(type) &&
        type.includes("string") &&
        type.includes("number"))
    ) {
      onChange(Number.isNaN(+newValue) ? newValue : Number(newValue));
    } else {
      onChange(newValue);
    }
  };

  const [draftValue, setDraftValue] = useState(value);

  /**
   * Keep track of the previous externally-provided value, in case the entity is updated while the menu is open.
   */
  const previousValue = useRef<JsonValue | undefined>(undefined);
  useEffect(() => {
    previousValue.current = value;
  });

  if (previousValue.current !== value && value !== draftValue) {
    setDraftValue(value);
  }

  if (type === "boolean") {
    return (
      <FormControlLabel
        control={
          <Checkbox
            onChange={(event) => onChange(event.target.checked)}
            checked={typeof value === "boolean" ? value : value === "true"}
          />
        }
        label={name}
      />
    );
  }

  if (type === "string") {
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
      >
        {(enumList ?? []).map((option: string) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  if (type === "number") {
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
  }

  if (
    Array.isArray(type) &&
    type.includes("string") &&
    type.includes("number")
  ) {
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
      >
        {(enumList ?? []).map((option: string) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  throw new Error(`Property type ${type} config input not implemented`);
};

type BlockConfigMenuProps = {
  anchorRef: ForwardedRef<HTMLDivElement>;
  blockEntity: BlockEntity | null;
  blockSchema?: JsonSchema | null;
  closeMenu: () => void;
  popupState: PopupState;
  updateConfig: (propertiesToUpdate: JsonObject) => void;
};

/**
 * Provides a generic UI for setting properties on the entity a block is rendering.
 * Useful for when the block doesn't provide the UI to do so itself.
 * Only the properties listed in the block's schema as 'configProperties' are shown.
 */
export const BlockConfigMenu: FunctionComponent<BlockConfigMenuProps> = ({
  anchorRef,
  blockEntity,
  blockSchema,
  closeMenu,
  popupState,
  updateConfig,
}) => {
  useKey(["Escape"], closeMenu);

  const configProperties = extractConfigPropertySchemas(blockSchema ?? {});

  const entityData = blockEntity?.blockChildEntity.properties as
    | JsonObject
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
            value={entityData?.[name] ?? ""}
          />
        </Box>
      ))}
      {!configProperties.length && (
        <Box sx={{ mt: 2 }}>No block config properties available.</Box>
      )}
    </Popover>
  );
};
