import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import {
  Box,
  Fade,
  IconButton,
  inputBaseClasses,
  TextField,
  TextFieldProps,
  useTheme,
} from "@mui/material";
import { useRef, useState } from "react";

export const EditableField = ({
  iconSize,
  readonly,
  value,
  placeholder,
  sx,
  onBlur,
  ...props
}: { iconSize: string; readonly?: boolean } & TextFieldProps) => {
  const { transitions } = useTheme();

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(!readonly && !value ? true : false);
  const inputRef = useRef<HTMLDivElement | null>(null);

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        display: "flex",
      }}
    >
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
            setEditing(false);
          }
        }}
        multiline
        inputRef={inputRef}
        inputProps={{
          readOnly: !editing,
          ...props.inputProps,
        }}
        variant="standard"
        placeholder={!readonly ? placeholder : undefined}
        sx={{
          width: "100%",
          [`.${inputBaseClasses.root}`]: {
            paddingTop: 0,
            transition: transitions.create("padding"),
            ...(!editing ? { p: 0 } : {}),
          },
          ...(!editing
            ? {
                "& ::before": {
                  borderWidth: "0 !important",
                },
                "& ::after": {
                  borderWidth: "0 !important",
                },
              }
            : {}),
          ...(Array.isArray(sx) ? sx : [sx]),
        }}
      />

      {!readonly ? (
        <Fade in={hovered && !editing}>
          <Box sx={{ position: "relative" }}>
            <IconButton
              onClick={() => {
                setEditing(true);
                inputRef.current?.focus();
              }}
              sx={{
                position: "absolute",
                top: -4,
                padding: 0.5,
              }}
            >
              <FontAwesomeIcon
                icon={faPenToSquare}
                sx={{ fontSize: `${iconSize} !important` }}
              />
            </IconButton>
          </Box>
        </Fade>
      ) : null}
    </Box>
  );
};
