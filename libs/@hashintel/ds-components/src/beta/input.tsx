import { Field } from "@ark-ui/react/field";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { inputRecipe } from "./input.recipe";

export type InputProps = ComponentProps<typeof Input>;
export const Input = styled(Field.Input, inputRecipe);
