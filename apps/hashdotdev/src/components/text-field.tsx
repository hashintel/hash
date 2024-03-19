import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import type { TextFieldProps as MuiTextFieldProps } from "@mui/material";
import {
  Box,
  Collapse,
  FormHelperText,
  TextField as MuiTextField,
} from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";
import { useEffect, useState } from "react";

import { FontAwesomeIcon } from "./icons/font-awesome-icon";

type TextFieldProps = {
  displayErrorOnTouched?: boolean;
} & MuiTextFieldProps;

export const TextField: FunctionComponent<TextFieldProps> = ({
  helperText,
  sx,
  ...textFieldProps
}) => {
  const [recentHelperText, setRecentHelperText] = useState<
    ReactNode | undefined
  >(helperText);

  useEffect(() => {
    if (helperText) {
      setRecentHelperText(helperText);
    }
  }, [helperText]);

  return (
    <Box sx={sx}>
      {/** @todo: instead of using the wrapper MuiTextField component use the underlying Mui components:
       *     - [FormControl](https://mui.com/api/form-control/)
       *     - [InputLabel](https://mui.com/api/input-label/)
       *     - [FilledInput](https://mui.com/api/filled-input/)
       *     - [OutlinedInput](https://mui.com/api/outlined-input/)
       *     - [Input](https://mui.com/api/input/)
       *     - [FormHelperText](https://mui.com/api/form-helper-text/)
       */}
      <MuiTextField
        {...textFieldProps}
        InputProps={{
          ...textFieldProps.InputProps,
          /** @todo: figure out why this is required and the theme defaultProps cannot be relied on */
          ...{ notched: false },
          endAdornment: textFieldProps.error ? (
            <FontAwesomeIcon
              icon={faCircleExclamation}
              sx={{
                fontSize: 16,
              }}
            />
          ) : (
            textFieldProps.InputProps?.endAdornment
          ),
        }}
      />
      <Collapse
        in={!!helperText}
        onExited={() => setRecentHelperText(undefined)}
      >
        <FormHelperText
          error={textFieldProps.error}
          sx={{ fontWeight: 400, fontSize: 14, mt: 1, textAlign: "center" }}
        >
          {recentHelperText}
        </FormHelperText>
      </Collapse>
    </Box>
  );
};
