"use client";

/* eslint-disable import/no-extraneous-dependencies */

import { ark } from "@ark-ui/react/factory";
import { createStyleContext } from "@hashintel/ds-helpers/jsx";
import { InfoIcon } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";

import { alert } from "./alert.atomic.recipe";

const { withProvider, withContext } = createStyleContext(alert);

export type RootProps = ComponentProps<typeof Root>;
export const Root = withProvider(ark.div, "root");
export const Title = withContext(ark.h3, "title");
export const Description = withContext(ark.div, "description");
export const Content = withContext(ark.div, "content");

type IndicatorProps = ComponentProps<typeof StyledIndicator>;
const StyledIndicator = withContext(ark.span, "indicator");

export const Indicator = forwardRef<HTMLSpanElement, IndicatorProps>(
  (props, ref) => {
    return (
      <StyledIndicator ref={ref} {...props}>
        <InfoIcon />
      </StyledIndicator>
    );
  },
);

export const Alert = {
  Root,
  Title,
  Description,
  Content,
  Indicator,
};
