import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  FormHelperText,
  TextField as MuiTextField,
  TextFieldProps as MuiTextFieldProps,
} from "@mui/material";
import { VFC } from "react";
import { FontAwesomeIcon } from "./icons";

type TextFieldProps = {} & MuiTextFieldProps;

export const TextField: VFC<TextFieldProps> = ({
  helperText,
  sx,
  InputProps,
  ...textFieldProps
}) => {
  return (
    <Box sx={sx}>
      <MuiTextField
        {...textFieldProps}
        InputLabelProps={{
          disableAnimation: true,
          shrink: true,
        }}
        InputProps={{
          ...{ notched: false },
          ...InputProps,
          endAdornment: textFieldProps.error ? (
            <Box>
              <FontAwesomeIcon
                icon={faCircleExclamation}
                sx={{
                  fontSize: 22,
                }}
              />
            </Box>
          ) : (
            InputProps?.endAdornment
          ),
        }}
      />

      <Collapse in={!!helperText}>
        <FormHelperText
          error={textFieldProps.error}
          sx={{ marginTop: 1, fontSize: 15 }}
        >
          {helperText}
        </FormHelperText>
      </Collapse>
    </Box>
  );
};
