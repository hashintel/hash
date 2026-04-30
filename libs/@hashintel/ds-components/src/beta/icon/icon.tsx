import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { icon } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type IconProps = ComponentProps<typeof Icon>;
export const Icon = styled(ark.svg, icon, {
  defaultProps: { asChild: true },
});
