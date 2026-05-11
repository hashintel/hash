import { Field } from "@ark-ui/react/field";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { textareaRecipe } from "./textarea.recipe";

export type TextareaProps = ComponentProps<typeof Textarea>;
export const Textarea = styled(Field.Textarea, textareaRecipe);
