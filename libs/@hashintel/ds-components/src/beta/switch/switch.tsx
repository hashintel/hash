"use client";

import { ark } from "@ark-ui/react/factory";
import { Switch, useSwitchContext } from "@ark-ui/react/switch";
import { createStyleContext, styled } from "@hashintel/ds-helpers/jsx";
import { switchRecipe } from "@hashintel/ds-helpers/recipes";
import { type ComponentProps, forwardRef, type ReactNode } from "react";

const { withProvider, withContext } = createStyleContext(switchRecipe);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(Switch.Root, "root");
export const RootProvider = withProvider(Switch.RootProvider, "root");
export const Label = withContext(Switch.Label, "label");
export const Thumb = withContext(Switch.Thumb, "thumb");
export const HiddenInput = Switch.HiddenInput;

export const Control = withContext(Switch.Control, "control", {
  defaultProps: { children: <Thumb /> },
});

export { SwitchContext as Context } from "@ark-ui/react/switch";

interface IndicatorProps extends ComponentProps<typeof StyledIndicator> {
  fallback?: ReactNode | undefined;
}

const StyledIndicator = withContext(ark.span, "indicator");
export const Indicator = forwardRef<HTMLSpanElement, IndicatorProps>(
  (props, ref) => {
    const { fallback, children, ...rest } = props;
    const api = useSwitchContext();
    return (
      <StyledIndicator
        ref={ref}
        data-checked={api.checked ? "" : undefined}
        {...rest}
      >
        {api.checked ? children : fallback}
      </StyledIndicator>
    );
  },
);

interface ThumbIndicatorProps
  extends ComponentProps<typeof StyledThumbIndicator> {
  fallback?: React.ReactNode | undefined;
}

const StyledThumbIndicator = styled(ark.span);
export const ThumbIndicator = forwardRef<HTMLSpanElement, ThumbIndicatorProps>(
  (props, ref) => {
    const { fallback, children, ...rest } = props;
    const api = useSwitchContext();
    return (
      <StyledThumbIndicator
        ref={ref}
        data-checked={api.checked ? "" : undefined}
        {...rest}
      >
        {api.checked ? children : fallback}
      </StyledThumbIndicator>
    );
  },
);
