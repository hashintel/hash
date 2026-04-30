"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Checkbox, useCheckboxContext } from "@ark-ui/react/checkbox";
import { createStyleContext, styled } from "@hashintel/ds-helpers/jsx";
import { checkbox } from "@hashintel/ds-helpers/recipes";
import type { HTMLStyledProps } from "@hashintel/ds-helpers/types";
import { type ComponentProps, forwardRef } from "react";

const { withProvider, withContext } = createStyleContext(checkbox);

export type RootProps = ComponentProps<typeof Root>;
export type HiddenInputProps = ComponentProps<typeof HiddenInput>;

export const Root = withProvider(Checkbox.Root, "root");
export const RootProvider = withProvider(Checkbox.RootProvider, "root");
export const Control = withContext(Checkbox.Control, "control");
export const Group = withProvider(Checkbox.Group, "group");
export const Label = withContext(Checkbox.Label, "label");
export const HiddenInput = Checkbox.HiddenInput;

export {
  type CheckboxCheckedState as CheckedState,
  CheckboxGroupProvider as GroupProvider,
} from "@ark-ui/react/checkbox";

// styled.svg is typed too broadly to satisfy strict TS in this context
// biome-ignore lint/suspicious/noExplicitAny: union type too complex for TS
const StyledSvg = styled.svg as React.ComponentType<any>;

export const Indicator = forwardRef<SVGSVGElement, HTMLStyledProps<"svg">>(
  (props, ref) => {
    const { indeterminate, checked } = useCheckboxContext();

    return (
      <Checkbox.Indicator indeterminate={indeterminate} asChild>
        <StyledSvg
          ref={ref}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3px"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...props}
        >
          <title>Checkmark</title>
          {indeterminate ? (
            <path d="M5 12h14" />
          ) : checked ? (
            <path d="M20 6 9 17l-5-5" />
          ) : null}
        </StyledSvg>
      </Checkbox.Indicator>
    );
  },
);
