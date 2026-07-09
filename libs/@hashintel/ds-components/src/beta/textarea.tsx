import { Field } from "@ark-ui/react/field";

import { styled } from "@hashintel/ds-helpers/jsx";

import { textareaRecipe } from "./textarea.recipe";

import type { ComponentProps } from "react";

export type TextareaProps = ComponentProps<typeof Textarea>;
export const Textarea = styled(Field.Textarea, textareaRecipe);
