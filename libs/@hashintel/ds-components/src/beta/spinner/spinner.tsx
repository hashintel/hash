import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { spinner } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type SpinnerProps = ComponentProps<typeof Spinner>;
export const Spinner = styled(ark.span, spinner);
