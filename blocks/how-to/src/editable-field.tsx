import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faPen, FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  Fade,
  IconButton,
  InputBase,
  InputBaseProps,
  SxProps,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";

export const EditableField = ({
  fontSize,
  readonly,
  placeholderSx = {},
  value,
  placeholder,
  sx,
  onBlur,
  ...props
}: {
  fontSize: string;
  readonly?: boolean;
  placeholderSx?: SxProps<Theme>;
} & InputBaseProps) => {
  const { palette } = useTheme();

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [inputHeight, setInputHeight] = useState(0);

  useEffect(() => {
    if (!inputRef.current) return;

    const resize = () => {
      const newInputHeight = inputRef.current?.offsetHeight;

      if (newInputHeight) {
        setInputHeight(newInputHeight);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });

    if (editing) {
      inputRef.current.focus();
    }

    window.addEventListener("resize", resize);
    resizeObserver.observe(inputRef.current);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [editing]);

  return readonly && !value ? null : (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box
        sx={{
          ...(editing ? { flex: 1 } : {}),
          position: "relative",
          transition: ({ transitions }) =>
            inputHeight ? transitions.create("height") : "none",
          ...(inputHeight ? { height: inputHeight } : {}),
        }}
      >
        {!editing ? (
          <>
            <Typography
              component="span"
              ref={inputRef}
              onClick={() => {
                if (!editing && !value && !readonly) {
                  setEditing(true);
                }
              }}
              sx={[
                ...(Array.isArray(sx) ? sx : [sx]),
                {
                  width: 1,
                  wordBreak: "break-word",
                  whiteSpace: "break-spaces",
                  ...(!value
                    ? {
                        color: palette.gray[50],
                        opacity: 1,
                        ...placeholderSx,
                      }
                    : {}),
                  ...(!editing && !value
                    ? {
                        cursor: "pointer",
                      }
                    : null),
                },
              ]}
            >
              {value && typeof value === "string" ? (
                value
              ) : (
                <>
                  {placeholder}{" "}
                  <FontAwesomeIcon
                    icon={{ icon: faPen }}
                    sx={{
                      fontSize: `inherit !important`,
                    }}
                  />
                </>
              )}
            </Typography>
          </>
        ) : (
          <InputBase
            {...props}
            multiline
            value={value}
            autoFocus
            onBlur={(event) => {
              setEditing(false);
              onBlur?.(event);
            }}
            onKeyDown={({ shiftKey, code }) => {
              if (!shiftKey && code === "Enter") {
                inputRef.current?.blur();
              }
            }}
            onClick={() => {
              if (!editing && !value) {
                setEditing(true);
              }
            }}
            onFocus={(event) =>
              event.currentTarget.setSelectionRange(
                event.currentTarget.value.length,
                event.currentTarget.value.length,
              )
            }
            inputRef={inputRef}
            placeholder={!readonly ? placeholder : undefined}
            inputProps={{
              sx: [
                {
                  "&::placeholder": {
                    color: palette.gray[50],
                    opacity: 1,
                    ...placeholderSx,
                  },
                },
              ],
            }}
            sx={[
              {
                width: 1,
                p: 0,
              },
              ...(Array.isArray(sx) ? sx : [sx]),
            ]}
          />
        )}
      </Box>

      <Fade in={!!value && hovered && !editing} timeout={editing ? 0 : 300}>
        <IconButton
          tabIndex={0}
          onClick={() => {
            setEditing(true);
            inputRef.current?.focus();
          }}
          sx={{
            display: "inline-flex",
            fontSize: "inherit",
            padding: 0.5,
            marginTop: -0.25,
          }}
        >
          <FontAwesomeIcon
            icon={{ icon: faPenToSquare.icon }}
            sx={{
              fontSize: `${fontSize} !important`,
            }}
          />
        </IconButton>
      </Fade>
    </Box>
  );
};
