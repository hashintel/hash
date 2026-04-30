import { Field } from "@ark-ui/react/field";
import { styled } from "@hashintel/ds-helpers/jsx";
import { input } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type InputProps = ComponentProps<typeof Input>;
export const Input = styled(Field.Input, input);
