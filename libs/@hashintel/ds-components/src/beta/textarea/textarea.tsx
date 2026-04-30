import { Field } from "@ark-ui/react/field";
import { styled } from "@hashintel/ds-helpers/jsx";
import { textarea } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type TextareaProps = ComponentProps<typeof Textarea>;
export const Textarea = styled(Field.Textarea, textarea);
