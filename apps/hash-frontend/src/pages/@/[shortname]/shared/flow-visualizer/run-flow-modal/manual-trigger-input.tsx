import { TextField } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Switch } from "@mui/material";
import type { JSX } from "react";

import { EntitySelector } from "../../../../../shared/entity-selector";
import { EntityTypeSelector } from "../../../../../shared/entity-type-selector";
import { GoogleAccountSelect } from "../../../../../shared/integrations/google/google-account-select";
import { SelectOrNameGoogleSheet } from "../../../../../shared/integrations/google/select-or-name-google-sheet";
import { inputHeight } from "./shared/dimensions";
import type { FormState, LocalPayload } from "./types";

const textFieldSx: SxProps<Theme> = {
  width: "100%",
  /**
   * Aligns with the Autocomplete used for EntityTypeSelector and WebSelector.
   */
  height: inputHeight,
};

export const ManualTriggerInput = <Payload extends LocalPayload>({
  array,
  formState,
  payload,
  required,
  setValue,
}: {
  array: boolean;
  formState: FormState;
  payload: Payload;
  required: boolean;
  setValue: (value: Payload["value"]) => void;
}): JSX.Element => {
  switch (payload.kind) {
    case "Text":
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple texts is not supported");
      }
      return (
        <TextField
          onChange={(event) => setValue(event.target.value)}
          placeholder={`${
            required ? "Required" : "Optional"
          } to start the flow`}
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
          placeholder={`${
            required ? "Required" : "Optional"
          } to start the flow`}
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
    case "Date":
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple dates is not supported");
      }
      return (
        <TextField
          onChange={(event) => setValue(event.target.value)}
          sx={textFieldSx}
          type="date"
          value={payload.value}
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
    case "Entity": {
      return (
        <EntitySelector
          autoFocus={false}
          includeDrafts={false}
          inputHeight={inputHeight}
          multiple={array}
          onSelect={setValue}
          value={payload.value}
        />
      );
    }
    case "GoogleAccountId": {
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple Google accounts is not supported");
      }
      return (
        <GoogleAccountSelect
          googleAccountId={payload.value}
          setGoogleAccountId={setValue}
        />
      );
    }
    case "GoogleSheet": {
      if (array || Array.isArray(payload.value)) {
        throw new Error("Selecting multiple Google sheets is not supported");
      }

      const googleAccountInput = Object.values(formState).find(
        (entry) => entry.payload.kind === "GoogleAccountId",
      );
      const googleAccountId = googleAccountInput?.payload.value;

      return (
        <SelectOrNameGoogleSheet
          setGoogleSheet={setValue}
          googleAccountId={
            typeof googleAccountId === "string" ? googleAccountId : undefined
          }
          googleSheet={payload.value}
        />
      );
    }
  }
};
