import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import type {
  InputProps,
  TextFieldProps as MuiTextFieldProps,
} from "@mui/material";
import {
  InputAdornment,
  inputClasses,
  outlinedInputClasses,
} from "@mui/material";

import { FontAwesomeIcon } from "./fontawesome-icon";

export type TextFieldProps = {
  success?: boolean;
  showLabelCornerHint?: boolean;
  autoResize?: boolean;
} & MuiTextFieldProps;

export const getInputProps = ({
  success,
  variant,
  error,
  multiline,
  autoResize,
  ...otherProps
}: InputProps &
  Pick<
    TextFieldProps,
    "success" | "error" | "multiline" | "autoResize" | "variant"
  > = {}): InputProps => {
  const { sx: InputPropsSx = [], ...otherInputProps } = otherProps;

  const renderEndAdornment = () => {
    if (!!error || success) {
      return (
        <InputAdornment position="end">
          <FontAwesomeIcon
            icon={success ? faCheckCircle : faCircleExclamation}
            sx={({ palette }) => ({
              color: success ? palette.blue[70] : palette.red[60],
            })}
          />
        </InputAdornment>
      );
    }
    return null;
  };

  return {
    sx: [
      ({ palette }) => ({
        [`& .${outlinedInputClasses.notchedOutline}, &:hover .${outlinedInputClasses.notchedOutline}, &.${inputClasses.disabled} .${outlinedInputClasses.notchedOutline}`]:
          {
            borderColor: error ? palette.red[40] : palette.gray[30],
          },
        [`&.${inputClasses.disabled}`]: { backgroundColor: palette.gray[20] },
        ...(multiline &&
          autoResize && {
            [`& .${outlinedInputClasses.input}`]: {
              resize: "auto",
            },
          }),
      }),
      ...(Array.isArray(InputPropsSx) ? InputPropsSx : [InputPropsSx]),
    ],
    /** `notched` is only expected for `outlined` variant, passing it for other variants gives a console warning
     * @see https://github.com/mui/material-ui/issues/32550 for context
     */
    ...(variant === "outlined" ? { notched: false } : {}),
    ...otherInputProps,
    endAdornment:
      !!error || success ? renderEndAdornment() : otherProps.endAdornment,
  };
};
export const inputLabelProps = {
  disableAnimation: true,
  shrink: true,
};
