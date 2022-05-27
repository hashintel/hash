import {
  faCheckCircle,
  faCircleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  InputAdornment,
  outlinedInputClasses,
  // eslint-disable-next-line no-restricted-imports
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
  Typography,
} from "@mui/material";
import { forwardRef, VFC } from "react";
import { FontAwesomeIcon } from "../icons";

type TextFieldProps = {
  success?: boolean;
  showLabelCornerHint?: boolean;
  autoResize?: boolean;
} & MuiTextFieldProps;

export const TextField: VFC<TextFieldProps> = forwardRef(
  (
    {
      helperText,
      sx,
      InputProps = {},
      success,
      error,
      label,
      showLabelCornerHint,
      autoResize,
      ...textFieldProps
    },
    ref,
  ) => {
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
      <MuiTextField
        ref={ref}
        sx={sx}
        {...textFieldProps}
        error={error}
        label={
          label ? (
            <>
              {label}
              {showLabelCornerHint && (
                <Typography
                  component="span"
                  variant="smallTextLabels"
                  sx={({ palette }) => ({
                    position: "absolute",
                    right: 0,
                    fontWeight: 400,
                    color: palette.gray[60],
                  })}
                >
                  {textFieldProps.required ? "Required" : "Optional"}
                </Typography>
              )}
            </>
          ) : null
        }
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
              ...(textFieldProps.multiline &&
                autoResize && {
                  [`& .${outlinedInputClasses.input}`]: {
                    resize: "auto",
                  },
                }),
            }),
            ...(Array.isArray(InputPropsSx) ? InputPropsSx : [InputPropsSx]),
          ],
          ...{ notched: false },
          ...otherInputProps,
          endAdornment:
            error || success ? renderEndAdornment() : InputProps?.endAdornment,
        }}
        helperText={
          <Collapse in={!!helperText}>
            <Box>{helperText}</Box>
          </Collapse>
        }
        FormHelperTextProps={{
          ...{ as: "div" },
          error,
          sx: ({ typography, palette }) => ({
            marginLeft: 0,
            mt: 0.75,
            ...typography.smallTextLabels,
            color: error ? palette.red[80] : palette.gray[60],
          }),
        }}
        minRows={3}
      />
    );
  },
);

TextField.displayName = "TextField";
