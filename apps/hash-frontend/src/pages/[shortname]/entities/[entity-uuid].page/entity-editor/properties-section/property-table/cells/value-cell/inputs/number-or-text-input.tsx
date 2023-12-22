import { TextField, TextFieldProps } from "@hashintel/design-system";
import { DataTypeWithMetadata } from "@local/hash-subgraph";

import { CellInputProps } from "./types";

export const NumberOrTextInput = ({
  expectedType,
  onBlur,
  onChange,
  onEnterPressed,
  value,
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
      ? expectedType.minimum
      : "exclusiveMaximum" in expectedType &&
        typeof expectedType.exclusiveMaximum === "number"
      ? expectedType.exclusiveMaximum - 1
      : undefined;
  const step =
    "multipleOf" in expectedType ? expectedType.multipleOf : undefined;

  const format = "format" in expectedType ? expectedType.format : undefined;

  let inputType: TextFieldProps["type"] = isNumber ? "number" : "text";
  switch (format) {
    case "date-time":
      inputType = "datetime-local";
      break;
    case "date":
      inputType = "date";
      break;
    case "time":
      inputType = "time";
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

        const newValue =
          isNumber && !isEmptyString ? Number(target.value) : target.value;

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
