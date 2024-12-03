import type { ValueConstraints } from "@blockprotocol/type-system-rs/pkg/type-system";
import type { TextFieldProps } from "@hashintel/design-system";
import { TextField } from "@hashintel/design-system";
import { format, formatISO, parseISO } from "date-fns";

import type { CellInputProps } from "./types";

/**
 * Get the current offset from UTC according to the user's device.
 */
const getCurrentUtcOffsetString = () => {
  const offset = new Date().getTimezoneOffset();

  const hours = Math.abs(Math.floor(offset / 60));
  const minutes = Math.abs(offset % 60);

  const offsetString = `${offset > 0 ? "-" : "+"}${String(hours).padStart(
    2,
    "0",
  )}:${String(minutes).padStart(2, "0")}`;

  return offsetString;
};

/**
 * Convert a datetime-local string (without timezone) to its RFC3339 equivalent,
 * including the UTC offset according to the user's device.
 */
const convertDateTimeToLocalRFC3339 = (dateTimeStringWithoutOffset: string) => {
  const date = parseISO(dateTimeStringWithoutOffset);

  return formatISO(date, { representation: "complete" });
};

export const NumberOrTextInput = ({
  isNumber,
  onBlur,
  onChange,
  onEnterPressed,
  value: uncheckedValue,
  valueConstraints,
}: CellInputProps<number | string | undefined> & {
  isNumber: boolean;
  onBlur?: TextFieldProps["onBlur"];
  onEnterPressed?: () => void;
  valueConstraints: ValueConstraints;
}) => {
  const minLength =
    "minLength" in valueConstraints ? valueConstraints.minLength : undefined;
  const maxLength =
    "maxLength" in valueConstraints ? valueConstraints.maxLength : undefined;

  const step =
    "multipleOf" in valueConstraints &&
    valueConstraints.multipleOf !== undefined
      ? valueConstraints.multipleOf
      : 0.01;

  const exclusiveMinimum =
    "exclusiveMinimum" in valueConstraints &&
    typeof valueConstraints.exclusiveMinimum === "boolean"
      ? valueConstraints.exclusiveMinimum
      : false;
  const minimum =
    "minimum" in valueConstraints &&
    typeof valueConstraints.minimum === "number"
      ? valueConstraints.minimum + (exclusiveMinimum ? step : 0)
      : undefined;

  const exclusiveMaximum =
    "exclusiveMaximum" in valueConstraints &&
    typeof valueConstraints.exclusiveMaximum === "boolean"
      ? valueConstraints.exclusiveMaximum
      : false;
  const maximum =
    "maximum" in valueConstraints &&
    typeof valueConstraints.maximum === "number"
      ? valueConstraints.maximum - (exclusiveMaximum ? step : 0)
      : undefined;

  const jsonStringFormat =
    "format" in valueConstraints ? valueConstraints.format : undefined;

  let inputType: TextFieldProps["type"] = isNumber ? "number" : "text";
  let value = uncheckedValue;
  switch (jsonStringFormat) {
    case "date-time":
      inputType = "datetime-local";
      if (typeof value === "string" && value) {
        const datetime = parseISO(value);
        // reformat the date to match the datetime-local input type
        value = format(datetime, "yyyy-MM-dd'T'HH:mm:ss.SSS");
      }
      break;
    case "date":
      inputType = "date";
      break;
    case "time":
      inputType = "time";
      if (typeof value === "string" && value) {
        // drop the offset from the end of the time to match the input type
        value = value.split(/([Z+-])/)[0];
      }
      break;
    case "email":
      inputType = "email";
      break;
    case "uri":
      inputType = "url";
      break;
  }

  return (
    <TextField
      sx={{ width: "100%" }}
      variant="standard"
      InputProps={{
        disableUnderline: true,
        inputProps: {
          minLength,
          maxLength,
          minimum,
          maximum,
          step,
        },
      }}
      autoFocus
      multiline={inputType === "text"}
      minRows={1}
      value={value}
      type={inputType}
      inputMode={isNumber ? "numeric" : "text"}
      placeholder={isNumber ? "Enter a number" : "Start typing..."}
      onBlur={onBlur}
      onChange={({ target }) => {
        const isEmptyString = target.value === "";

        let newValue =
          isNumber && !isEmptyString ? Number(target.value) : target.value;

        if (newValue && jsonStringFormat === "date-time") {
          newValue = convertDateTimeToLocalRFC3339(target.value);
        } else if (newValue && jsonStringFormat === "time") {
          newValue += ":00"; // add seconds
          newValue += getCurrentUtcOffsetString();
        }

        // Unset the value if it's empty
        onChange(isEmptyString ? undefined : newValue);

        target.checkValidity();
      }}
      onKeyDown={(event) => {
        if (onEnterPressed && event.key === "Enter") {
          event.stopPropagation();
          onEnterPressed();
        }
      }}
    />
  );
};
