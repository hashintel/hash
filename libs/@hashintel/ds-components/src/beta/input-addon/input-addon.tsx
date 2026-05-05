import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { inputAddon } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type InputAddonProps = ComponentProps<typeof InputAddon>;
export const InputAddon = styled(ark.div, inputAddon);
