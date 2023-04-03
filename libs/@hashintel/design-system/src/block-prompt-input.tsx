import {
  Box,
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
import {
  FormEvent,
  forwardRef,
  FunctionComponent,
  ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";

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
        onChange,
        disabled,
        ...props
      },
      ref,
    ) => {
      const inputRef = useRef<HTMLTextAreaElement | null>();
      const [hasMultipleLines, setHasMultipleLines] = useState(false);

      const calculateMultipleLines = useCallback(() => {
        if (inputRef.current) {
          const computedStyles = window.getComputedStyle(
            inputRef.current,
            null,
          );

          const lineHeight = parseInt(
            computedStyles.getPropertyValue("line-height"),
            10,
          );
          const paddingLeft = parseInt(
            computedStyles.getPropertyValue("padding-left"),
            10,
          );
          const paddingRight = parseInt(
            computedStyles.getPropertyValue("padding-right"),
            10,
          );

          const width = inputRef.current.offsetWidth;

          // Calculate width and height of the text inside the input
          const temp = document.createElement("span");
          temp.style.fontSize = computedStyles.fontSize;
          temp.style.fontFamily = computedStyles.fontFamily;
          temp.style.lineHeight = computedStyles.lineHeight;
          temp.style.maxWidth = computedStyles.width;
          temp.style.wordBreak = "break-word";
          temp.style.whiteSpace = "break-spaces";
          temp.textContent = inputRef.current.value;
          document.body.appendChild(temp);
          const textWidth = temp.offsetWidth;
          const textHeight = temp.offsetHeight;
          document.body.removeChild(temp);

          const firstLineOverflowsButton =
            width -
              paddingLeft -
              paddingRight -
              textWidth -
              (hasMultipleLines ? 170 : 0) <
            0;

          const multipleLines = textHeight / lineHeight > 1;

          setHasMultipleLines(firstLineOverflowsButton || multipleLines);
        }
      }, [hasMultipleLines]);

      const submit = useCallback(
        (event: FormEvent) => {
          event.preventDefault();
          onSubmit?.();
        },
        [onSubmit],
      );

      return (
        <Box component="form" onSubmit={submit} sx={{ mb: 0 }}>
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
            onChange={(event) => {
              calculateMultipleLines();
              onChange?.(event);
            }}
            required
            ref={ref}
            inputRef={inputRef}
            disabled={disabled}
            sx={[
              ({ palette, transitions, spacing }) => ({
                display: "flex",
                alignItems: "flex-start",
                maxWidth: 580,
                width: 1,
                [`& .${inputBaseClasses.root}`]: {
                  width: 1,
                  [`& .${outlinedInputClasses.input}`]: {
                    minHeight: "unset",
                    fontSize: 16,
                    lineHeight: "21px",
                    paddingY: 2.125,
                    paddingX: `${spacing(2.75)}`,
                    paddingBottom: hasMultipleLines ? 7.5 : 2.125,
                    transition: transitions.create("padding-bottom"),
                  },

                  [`&.${inputBaseClasses.disabled}`]: {
                    background: palette.gray[10],
                    color: palette.gray[70],
                  },
                  [`&.${inputBaseClasses.focused}, &.${inputBaseClasses.disabled}`]:
                    {
                      boxShadow: "0px 1px 5px rgba(27, 33, 40, 0)",
                    },
                  [`& .${outlinedInputClasses.notchedOutline}`]: {
                    border: `1px solid ${palette.gray[20]}`,
                    transition: transitions.create("border-color"),
                  },
                  [`:hover .${outlinedInputClasses.notchedOutline}`]: {
                    borderColor: palette.gray[40],
                  },
                  [`&.${inputBaseClasses.focused} .${outlinedInputClasses.notchedOutline}, &.${inputBaseClasses.focused}:hover .${outlinedInputClasses.notchedOutline}`]:
                    {
                      borderWidth: "1px",
                      borderColor: `${palette.blue[70]}`,
                    },
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
                      background: "transparent",
                      borderRadius: 0,
                      borderTopLeftRadius: hasMultipleLines ? 10 : 0,
                      transition: ({ transitions }) =>
                        transitions.create("border-top-left-radius"),
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
                      position: hasMultipleLines ? "absolute" : "relative",
                      right: 0,
                      [`&.${buttonBaseClasses.disabled}`]: {
                        color: palette.common.black,
                        background: "none",
                      },
                      ":hover": {
                        color: palette.blue[70],
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
        </Box>
      );
    },
  );
