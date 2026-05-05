import { styled } from "@hashintel/ds-helpers/jsx";
import { text } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type TextProps = ComponentProps<typeof Text>;
export const Text = styled("p", text);
