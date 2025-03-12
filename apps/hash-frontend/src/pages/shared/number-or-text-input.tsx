import type { TextFieldProps } from "@hashintel/design-system";
import { TextField } from "@hashintel/design-system";
import type { MergedValueSchema } from "@local/hash-isomorphic-utils/data-types";
import { format, formatISO, parseISO } from "date-fns";
import type { Ref } from "react";

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
  fontSize,
  inputRef,
  isNumber,
  multiLineText,
  onBlur,
  onChange,
  onEnterPressed,
  onEscapePressed,
  schema,
  value: uncheckedValue,
}: {
  fontSize?: number;
  inputRef?: Ref<HTMLInputElement>;
  isNumber: boolean;
  multiLineText?: boolean;
  onBlur?: TextFieldProps["onBlur"];
  onChange: (value: number | string | undefined) => void;
  schema: MergedValueSchema;
  onEnterPressed?: () => void;
  onEscapePressed?: () => void;
  value: number | string | undefined;
}) => {
  const minLength = "minLength" in schema ? schema.minLength : undefined;
  const maxLength = "maxLength" in schema ? schema.maxLength : undefined;

  if ("multipleOf" in schema && schema.multipleOf?.[1] !== undefined) {
    throw new Error("multipleOf with multiple values is not supported");
  }

  let step =
    "multipleOf" in schema && schema.multipleOf?.[0] !== undefined
      ? schema.multipleOf[0]
      : 0.001;

  // Get the effective minimum value, considering both minimum and exclusiveMinimum
  const minimum =
    "minimum" in schema && typeof schema.minimum === "number"
      ? schema.minimum
      : undefined;

  const exclusiveMinimum =
    "exclusiveMinimum" in schema && typeof schema.exclusiveMinimum === "number"
      ? schema.exclusiveMinimum
      : undefined;

  const effectiveMinimum =
    typeof exclusiveMinimum === "number" ? exclusiveMinimum + step : minimum;

  // Get the effective maximum value, considering both maximum and exclusiveMaximum
  const maximum =
    "maximum" in schema && typeof schema.maximum === "number"
      ? schema.maximum
      : undefined;

  const exclusiveMaximum =
    "exclusiveMaximum" in schema && typeof schema.exclusiveMaximum === "number"
      ? schema.exclusiveMaximum
      : undefined;

  const effectiveMaximum =
    typeof exclusiveMaximum === "number" ? exclusiveMaximum - step : maximum;

  const jsonStringFormat = "format" in schema ? schema.format : undefined;

  let inputType: TextFieldProps["type"] = isNumber ? "number" : "text";
  let value = uncheckedValue;
  switch (jsonStringFormat) {
    case "date-time":
      inputType = "datetime-local";
      if (typeof value === "string" && value) {
        const datetime = parseISO(value);
        // reformat the date to match the datetime-local input type
        try {
          value = format(datetime, "yyyy-MM-dd'T'HH:mm:ss.SSS");
        } catch {
          value = "";
        }
      }
      step = 60;
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
      step = 60;
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
          min: effectiveMinimum,
          max: effectiveMaximum,
          step,
        },
        inputRef,
        sx: {
          fontSize,
        },
      }}
      autoFocus
      multiline={inputType === "text" && multiLineText}
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
          event.preventDefault();
          event.stopPropagation();
          onEnterPressed();
        }

        if (onEscapePressed && event.key === "Escape") {
          event.stopPropagation();
          onEscapePressed();
        }
      }}
    />
  );
};
