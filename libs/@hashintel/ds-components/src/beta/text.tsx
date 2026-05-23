import { styled } from "@hashintel/ds-helpers/jsx";

import { textRecipe } from "./text.recipe";

import type { ComponentProps } from "react";

export type TextProps = ComponentProps<typeof Text>;
export const Text = styled("p", textRecipe);
