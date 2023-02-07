import {
  Box,
  Fade,
  IconButton,
  inputBaseClasses,
  TextField,
  TextFieldProps,
  useTheme,
} from "@mui/material";
import { PenToSquareIcon } from "./icons/pen-to-square-icon";
import { useRef, useState } from "react";

export const EditableField = ({ sx, ...props }: TextFieldProps) => {
  const { transitions } = useTheme();

  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
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
        multiline
        inputRef={inputRef}
        inputProps={{
          readOnly: !editing,
          ...props.inputProps,
        }}
        variant="standard"
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

      <Fade in={hovered || editing}>
        <Box sx={{ position: "relative" }}>
          <IconButton
            onClick={() => {
              setEditing(!editing);
              inputRef.current?.focus();
            }}
            sx={{
              position: "absolute",
              top: -4,
              padding: 0.5,
            }}
          >
            <PenToSquareIcon sx={{ fontSize: 21 }} />
          </IconButton>
        </Box>
      </Fade>
    </Box>
  );
};
