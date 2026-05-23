"use client";

import { ark } from "@ark-ui/react/factory";
import { type ComponentProps, forwardRef, type ReactNode } from "react";

import { createStyleContext } from "@hashintel/ds-helpers/jsx";

import { inputGroupSlotRecipe } from "./input-group.recipe";

const { withProvider, withContext } = createStyleContext(inputGroupSlotRecipe);

type RootProps = ComponentProps<typeof Root>;
const Root = withProvider(ark.div, "root");
const Element = withContext(ark.div, "element");

export interface InputGroupProps extends RootProps {
  startElement?: ReactNode | undefined;
  endElement?: ReactNode | undefined;
}

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  (props, ref) => {
    const { startElement, endElement, children, ...rest } = props;

    return (
      <Root ref={ref} {...rest}>
        {startElement && (
          <Element insetInlineStart="0" top="0">
            {startElement}
          </Element>
        )}
        {children}
        {endElement && (
          <Element insetInlineEnd="0" top="0">
            {endElement}
          </Element>
        )}
      </Root>
    );
  },
);
