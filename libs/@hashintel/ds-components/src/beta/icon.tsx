import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { iconRecipe } from "./icon.recipe";

import type { ComponentProps } from "react";

export type IconProps = ComponentProps<typeof Icon>;
export const Icon = styled(ark.svg, iconRecipe, {
  defaultProps: { asChild: true },
});
