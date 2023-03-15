import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
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

import { faPen } from "./fa-icons/fa-pen";
import { FontAwesomeIcon } from "./fontawesome-icon";

export const EditableField = ({
  readonly,
  placeholderSx = {},
  value,
  placeholder,
  sx,
  onBlur,
  ...props
}: {
  readonly?: boolean;
  placeholderSx?: SxProps<Theme>;
} & InputBaseProps) => {
  const { palette } = useTheme();

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [inputHeight, setInputHeight] = useState(0);

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

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

  const fontSize = sx && "fontSize" in sx ? sx.fontSize?.toString() : null;
  const lineHeight =
    sx && "lineHeight" in sx ? sx.lineHeight?.toString() : null;

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
          <Typography
            component="span"
            ref={inputRef}
            onClick={() => {
              if (!value && !readonly) {
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
                ...(!value
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
                  // Override WP Input styles
                  lineHeight: `${lineHeight ?? 1} !important`,
                  minHeight: "unset",
                  border: "none",
                  boxShadow: "none !important",
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
              fontSize: `${fontSize ?? "16"} !important`,
            }}
          />
        </IconButton>
      </Fade>
    </Box>
  );
};
