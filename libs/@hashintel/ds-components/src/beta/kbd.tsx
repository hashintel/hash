import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { kbdRecipe } from "./kbd.recipe";

import type { ComponentProps } from "@hashintel/ds-helpers/types";

export type KbdProps = ComponentProps<typeof Kbd>;
export const Kbd = styled(ark.kbd, kbdRecipe);
