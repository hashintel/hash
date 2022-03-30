import {
  faCheckCircle,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  InputAdornment,
  outlinedInputClasses,
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
} from "@mui/material";
import { VFC } from "react";
import { FontAwesomeIcon } from "./icons";

type TextFieldProps = {
  success?: boolean;
} & MuiTextFieldProps;

export const TextField: VFC<TextFieldProps> = ({
  helperText,
  sx,
  InputProps = {},
  success,
  error,
  ...textFieldProps
}) => {
  const { sx: InputPropsSx = [], ...otherInputProps } = InputProps;

  const renderEndAdornment = () => {
    if (error || success) {
      return (
        <InputAdornment position="end">
          <FontAwesomeIcon
            icon={success ? faCheckCircle : faCircleExclamation}
            sx={({ palette }) => ({
              color: success ? palette.green[60] : palette.red[60],
            })}
          />
        </InputAdornment>
      );
    }
    return null;
  };

  return (
    <Box sx={sx}>
      <MuiTextField
        {...textFieldProps}
        error={error}
        InputLabelProps={{
          disableAnimation: true,
          shrink: true,
        }}
        InputProps={{
          sx: [
            ({ palette }) => ({
              [`& .${outlinedInputClasses.notchedOutline}, &:hover .${outlinedInputClasses.notchedOutline}`]:
                {
                  borderColor: success
                    ? palette.green[60]
                    : error
                    ? palette.red[40]
                    : palette.gray[30],
                },
            }),
            ...(Array.isArray(InputPropsSx) ? InputPropsSx : [InputPropsSx]),
          ],
          ...otherInputProps,
          endAdornment:
            error || success ? renderEndAdornment() : InputProps?.endAdornment,
        }}
        helperText={<Collapse in={!!helperText}>{helperText}</Collapse>}
        FormHelperTextProps={{
          error,
          sx: { marginTop: 1, fontSize: 15 },
        }}
      />
    </Box>
  );
};
