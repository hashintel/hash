import { styled } from "@hashintel/ds-helpers/jsx";
import { heading } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type HeadingProps = ComponentProps<typeof Heading>;
export const Heading = styled("h2", heading);
