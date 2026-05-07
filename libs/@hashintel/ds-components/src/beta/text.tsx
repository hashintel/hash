import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { textRecipe } from "./text.recipe";

export type TextProps = ComponentProps<typeof Text>;
export const Text = styled("p", textRecipe);
