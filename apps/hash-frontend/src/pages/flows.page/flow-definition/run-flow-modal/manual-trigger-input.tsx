import { TextField } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Switch } from "@mui/material";

import { EntityTypeSelector } from "../../../shared/entity-type-selector";
import { WebSelector } from "./manual-trigger-input/web-selector";
import { inputHeight } from "./shared/dimensions";
import type { LocalPayload } from "./types";

const textFieldSx: SxProps<Theme> = {
  width: "100%",
  /**
   * Aligns with the Autocomplete used for EntityTypeSelector and WebSelector.
   * Changing these
   */
  height: inputHeight,
};

export const ManualTriggerInput = <Payload extends LocalPayload>({
  array,
  payload,
  required,
  setValue,
}: {
  array: boolean;
  payload: Payload;
  required: boolean;
  setValue: (value: Payload["value"]) => void;
}) => {
  switch (payload.kind) {
    case "Text":
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple texts is not supported");
      }
      return (
        <TextField
          onChange={(event) => setValue(event.target.value)}
          placeholder={`${required ? "Required" : "Optional"} to start the flow`}
          sx={textFieldSx}
          value={payload.value}
        />
      );
    case "Number":
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple numbers is not supported");
      }
      return (
        <TextField
          onChange={(event) =>
            setValue(
              event.target.value !== "" ? Number(event.target.value) : "",
            )
          }
          placeholder={`${required ? "Required" : "Optional"} to start the flow`}
          sx={textFieldSx}
          type="number"
          value={payload.value}
        />
      );
    case "Boolean":
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple booleans is not supported");
      }
      return (
        <Switch
          size="medium"
          checked={payload.value}
          onChange={(event) => setValue(event.target.checked)}
        />
      );
    case "VersionedUrl": {
      return (
        <EntityTypeSelector
          autoFocus={false}
          disableCreate
          inputHeight={inputHeight}
          multiple={array}
          onSelect={(newValue) =>
            setValue(Array.isArray(newValue) ? newValue : newValue)
          }
          sx={{ height: inputHeight, maxWidth: "100%" }}
          value={payload.value}
        />
      );
    }
    case "WebId": {
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple webs is not supported");
      }
      return (
        <WebSelector
          selectedWebOwnedById={payload.value}
          setSelectedWebOwnedById={(newValue) => setValue(newValue)}
        />
      );
    }
  }
};
