import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { spinnerRecipe } from "./spinner.recipe";

import type { ComponentProps } from "react";

export type SpinnerProps = ComponentProps<typeof Spinner>;
export const Spinner = styled(ark.span, spinnerRecipe);
