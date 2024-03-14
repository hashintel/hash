import {
  Box,
  Collapse,
  formHelperTextClasses,
  TextField as MuiTextField,
  Typography,
  useTheme,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { forwardRef, useState } from "react";

import type { TextFieldProps } from "./input-props";
import { getInputProps, inputLabelProps } from "./input-props";

/**
 * 'Freezes' a value when it's falsy, meaning the value will never update to
 * be falsy. Useful for keeping a component the same when animating out
 */
const useFrozenValue = <T extends ReactNode>(value: T): T => {
  const [frozenValue, setFrozenValue] = useState(value);

  if (value && frozenValue !== value) {
    setFrozenValue(value);
  }
  return frozenValue;
};

export const TextField: FunctionComponent<TextFieldProps> = forwardRef(
  (
    {
      helperText,
      variant = "outlined",
      sx,
      InputProps,
      success,
      error,
      label,
      showLabelCornerHint,
      autoResize,
      ...textFieldProps
    },
    ref,
  ) => {
    const frozenHelperText = useFrozenValue(helperText);

    const theme = useTheme();

    return (
      <MuiTextField
        ref={ref}
        sx={[
          {
            ...(!helperText && {
              [`.${formHelperTextClasses.root}`]: {
                marginTop: 0,
              },
            }),
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        variant={variant}
        minRows={3}
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
        InputLabelProps={inputLabelProps}
        InputProps={getInputProps({
          ...InputProps,
          variant,
          success,
          error,
          autoResize,
          multiline: textFieldProps.multiline,
        })}
        helperText={
          <Collapse in={!!helperText}>
            <Box>{frozenHelperText}</Box>
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
        {...textFieldProps}
        // eslint-disable-next-line react/jsx-no-duplicate-props
        inputProps={{
          ...theme.components?.MuiInputBase?.defaultProps?.inputProps,
          ...textFieldProps.inputProps,
        }}
      />
    );
  },
);

TextField.displayName = "TextField";
