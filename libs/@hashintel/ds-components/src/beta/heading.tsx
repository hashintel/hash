import { styled } from "@hashintel/ds-helpers/jsx";

import { headingRecipe } from "./heading.recipe";

import type { ComponentProps } from "react";

export type HeadingProps = ComponentProps<typeof Heading>;
export const Heading = styled("h2", headingRecipe);
