import type { TextFieldProps } from "@hashintel/design-system";
import { TextField } from "@hashintel/design-system";
import type { DataTypeWithMetadata } from "@local/hash-subgraph";
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
  expectedType,
  onBlur,
  onChange,
  onEnterPressed,
  value: uncheckedValue,
  isNumber,
}: CellInputProps<number | string | undefined> & {
  onBlur?: TextFieldProps["onBlur"];
  expectedType: DataTypeWithMetadata["schema"];
  isNumber: boolean;
  onEnterPressed?: () => void;
}) => {
  const minLength =
    "minLength" in expectedType ? expectedType.minLength : undefined;
  const maxLength =
    "maxLength" in expectedType ? expectedType.maxLength : undefined;
  const minimum =
    "minimum" in expectedType
      ? expectedType.minimum
      : "exclusiveMinimum" in expectedType &&
          typeof expectedType.exclusiveMinimum === "number"
        ? expectedType.exclusiveMinimum + 1
        : undefined;
  const maximum =
    "maximum" in expectedType
      ? expectedType.maximum
      : "exclusiveMaximum" in expectedType &&
          typeof expectedType.exclusiveMaximum === "number"
        ? expectedType.exclusiveMaximum - 1
        : undefined;
  const step =
    "multipleOf" in expectedType ? expectedType.multipleOf : undefined;

  const jsonStringFormat =
    "format" in expectedType ? expectedType.format : undefined;

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
      placeholder="Start typing..."
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
