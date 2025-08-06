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
  Tooltip,
} from "@mui/material";

import { FontAwesomeIcon } from "./fontawesome-icon.js";
import { LoadingSpinner } from "./loading-spinner.js";

export type TextFieldProps = {
  /**
   * If `error` is true, this text will appear in a tooltip when hovering over the ! at the right of the input
   */
  errorText?: string;
  /**
   * If `true`, a loading spinner will be shown at the right of the input
   */
  loading?: boolean;
  /**
   * If `true`, a check icon will be shown at the right of the input
   */
  success?: boolean;
  /**
   * If `true`, the word 'Required' or 'Optional' will be appended to the label
   */
  showLabelCornerHint?: boolean;
  autoResize?: boolean;
  /**
   * Provide an informative tooltip when hovering over the input's label
   */
  tooltipText?: string;
} & MuiTextFieldProps;

export const getInputProps = ({
  success,
  variant,
  error,
  errorText,
  loading,
  multiline,
  autoResize,
  ...otherProps
}: InputProps &
  Pick<
    TextFieldProps,
    | "success"
    | "error"
    | "errorText"
    | "loading"
    | "multiline"
    | "autoResize"
    | "variant"
  > = {}): InputProps => {
  const { sx: InputPropsSx = [], ...otherInputProps } = otherProps;

  const renderEndAdornment = () => {
    if (!!error || !!success || loading) {
      return (
        <InputAdornment position="end">
          {loading ? (
            <LoadingSpinner size={16} />
          ) : (
            <Tooltip title={error && errorText ? errorText : ""}>
              <FontAwesomeIcon
                icon={success ? faCheckCircle : faCircleExclamation}
                sx={({ palette }) => ({
                  color: success ? palette.blue[70] : palette.red[60],
                })}
              />
            </Tooltip>
          )}
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
      !!error || !!success || loading
        ? renderEndAdornment()
        : otherProps.endAdornment,
  };
};
export const inputLabelProps = {
  disableAnimation: true,
  shrink: true,
};
