import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { headingRecipe } from "./heading.recipe";

export type HeadingProps = ComponentProps<typeof Heading>;
export const Heading = styled("h2", headingRecipe);
