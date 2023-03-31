import {
  Button,
  buttonBaseClasses,
  Collapse,
  inputBaseClasses,
  outlinedInputClasses,
  SxProps,
  TextField,
  TextFieldProps,
  Theme,
} from "@mui/material";
import { FormEvent, forwardRef, FunctionComponent, ReactNode } from "react";

import { BlockErrorMessage } from "./block-error-message";

type BlockPromptInputProps = {
  error?: boolean;
  apiName?: string;
  buttonLabel?: ReactNode;
  buttonSx?: SxProps<Theme>;
  onSubmit?: () => void;
} & TextFieldProps;

export const BlockPromptInput: FunctionComponent<BlockPromptInputProps> =
  forwardRef(
    (
      {
        error,
        apiName,
        buttonLabel,
        sx,
        buttonSx,
        onSubmit,
        disabled,
        ...props
      },
      inputRef,
    ) => {
      const submit = (event: FormEvent) => {
        event.preventDefault();
        onSubmit?.();
      };

      return (
        <form onSubmit={submit}>
          <TextField
            {...props}
            autoFocus
            multiline
            onKeyDown={(event) => {
              const { shiftKey, code } = event;
              if (!shiftKey && code === "Enter") {
                onSubmit?.(event);
              }
            }}
            placeholder="Enter a prompt to generate image, and hit enter"
            required
            ref={inputRef}
            disabled={disabled}
            sx={[
              ({ palette }) => ({
                maxWidth: 580,
                width: 1,
                [`& .${inputBaseClasses.input}`]: {
                  minHeight: "unset",
                  fontSize: 16,
                  lineHeight: "21px",
                  paddingY: 2.125,
                  paddingLeft: 2.75,
                  paddingRight: 0,
                },
                [`& .${inputBaseClasses.disabled}`]: {
                  background: palette.gray[10],
                  color: palette.gray[70],
                },
                [`& .${outlinedInputClasses.notchedOutline}`]: {
                  border: `1px solid ${palette.gray[20]}`,
                },
              }),
              ...(Array.isArray(sx) ? sx : [sx]),
            ]}
            InputProps={{
              endAdornment: (
                <Button
                  type="submit"
                  variant="tertiary_quiet"
                  disabled={disabled}
                  sx={[
                    ({ palette }) => ({
                      alignSelf: "flex-end",
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: palette.blue[70],
                      textTransform: "uppercase",
                      height: 55,
                      width: 1,
                      maxHeight: 55,
                      maxWidth: 168,
                      minHeight: 51,
                      whiteSpace: "nowrap",
                      [`&.${buttonBaseClasses.disabled}`]: {
                        color: palette.common.black,
                        background: "none",
                      },
                    }),
                    ...(Array.isArray(buttonSx) ? buttonSx : [buttonSx]),
                  ]}
                >
                  {buttonLabel}
                </Button>
              ),
            }}
          />

          {apiName ? (
            <Collapse in={error}>
              <BlockErrorMessage apiName={apiName} sx={{ mt: 1 }} />
            </Collapse>
          ) : null}
        </form>
      );
    },
  );
