import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faPen, FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  Fade,
  IconButton,
  inputBaseClasses,
  SxProps,
  TextField,
  TextFieldProps,
  Theme,
  Typography,
  useTheme,
} from "@mui/material";
import { useRef, useState } from "react";

export const EditableField = ({
  height,
  readonly,
  placeholderSx = {},
  value,
  placeholder,
  sx,
  onBlur,
  ...props
}: {
  height: string;
  readonly?: boolean;
  placeholderSx?: SxProps<Theme>;
} & TextFieldProps) => {
  const { palette } = useTheme();

  const [hovered, setHovered] = useState(false);
  const [buttonFocused, setButtonFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement | null>(null);

  return readonly && !value ? null : (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: "flex",
      }}
    >
      {!editing ? (
        <Typography
          onClick={() => {
            if (!editing && !value && !readonly) {
              setEditing(true);
            }
          }}
          sx={[
            ...(Array.isArray(sx) ? sx : [sx]),
            {
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
          {value && typeof value === "string" ? value : placeholder}
        </Typography>
      ) : (
        <TextField
          {...props}
          value={value}
          autoFocus
          onBlur={(event) => {
            setEditing(false);
            onBlur?.(event);
          }}
          onKeyDown={({ code }) => {
            if (code === "Enter") {
              inputRef.current?.blur();
            }
          }}
          onClick={() => {
            if (!editing && !value) {
              setEditing(true);
            }
          }}
          inputRef={inputRef}
          inputProps={{
            sx: [
              {
                height: "auto",
                p: 0,
                "&::placeholder": {
                  color: palette.gray[50],
                  opacity: 1,
                  ...placeholderSx,
                },
              },
              ...(Array.isArray(sx) ? sx : [sx]),
            ],
          }}
          variant="standard"
          placeholder={!readonly ? placeholder : undefined}
          sx={{
            width: "100%",
            [`.${inputBaseClasses.root}`]: {
              paddingTop: 0,
              height,
              p: 0,
            },
            "& ::before, & ::after": {
              display: "none",
              borderWidth: "0 !important",
            },
          }}
        />
      )}

      {!readonly ? (
        <Fade in={(hovered || buttonFocused) && !editing}>
          <Box sx={{ position: "relative", visibility: "visible !important" }}>
            <IconButton
              tabIndex={0}
              onClick={() => {
                setEditing(true);
                inputRef.current?.focus();
              }}
              sx={{
                position: "absolute",
                top: -4,
                left: 12,
                padding: 0.5,
              }}
              onFocus={() => setButtonFocused(true)}
              onBlur={() => setButtonFocused(false)}
            >
              <FontAwesomeIcon
                icon={{ icon: !value ? faPen : faPenToSquare.icon }}
                sx={{
                  fontSize: `${height} !important`,
                }}
              />
            </IconButton>
          </Box>
        </Fade>
      ) : null}
    </Box>
  );
};
