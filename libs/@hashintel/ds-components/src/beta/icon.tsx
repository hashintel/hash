import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { iconRecipe } from "./icon.recipe";

export type IconProps = ComponentProps<typeof Icon>;
export const Icon = styled(ark.svg, iconRecipe, {
  defaultProps: { asChild: true },
});
