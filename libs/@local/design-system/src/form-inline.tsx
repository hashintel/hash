import { Box, buttonClasses, outlinedInputClasses } from "@mui/material";
import { FunctionComponent, ReactNode } from "react";

type FormInlineProps = {
  children?: ReactNode;
};

/**
 * This is useful for rendering a TextField and Button component inline
 * <FormInline>
 *   <TextField />
 *   <Button />
 * </FormInline>
 * @see https://www.figma.com/file/gydVGka9FjNEg9E2STwhi2/HASH-Editor?node-id=823%3A67158
 */
export const FormInline: FunctionComponent<FormInlineProps> = ({
  children,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        [`& .${outlinedInputClasses.notchedOutline}`]: {
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        },
        [`& .${buttonClasses.root}`]: {
          alignSelf: "stetch",
          minHeight: "unset",
          py: 0,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          // This is a temporary hack to ensure the button has the exact same height
          // as the text field.
          // TextField has a FormHelperText which has a margin of the same value (0.75) even when the helper text is empty
          // and that ends up giving the TextField an extra height.
          mb: 0.75,
        },
      }}
    >
      {children}
    </Box>
  );
};
