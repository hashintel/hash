import { VisuallyHidden } from "@hashintel/ds-helpers/jsx";
import { forwardRef } from "react";

import * as StyledCheckbox from "./checkbox";

export type { CheckboxCheckedState } from "@ark-ui/react/checkbox";

export interface CheckboxProps extends StyledCheckbox.RootProps {
  inputProps?: StyledCheckbox.HiddenInputProps;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (props, ref) => {
    const { children, inputProps, ...rootProps } = props;
    return (
      <StyledCheckbox.Root {...rootProps}>
        <StyledCheckbox.HiddenInput ref={ref} {...inputProps} />
        <StyledCheckbox.Control>
          <StyledCheckbox.Indicator />
        </StyledCheckbox.Control>
        {children && <StyledCheckbox.Label>{children}</StyledCheckbox.Label>}
        {props["aria-label"] && (
          <StyledCheckbox.Label asChild>
            <VisuallyHidden>{props["aria-label"]}</VisuallyHidden>
          </StyledCheckbox.Label>
        )}
      </StyledCheckbox.Root>
    );
  },
);
