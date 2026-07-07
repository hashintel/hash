import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { inputAddonRecipe } from "./input-addon.recipe";

import type { ComponentProps } from "react";

export type InputAddonProps = ComponentProps<typeof InputAddon>;
export const InputAddon = styled(ark.div, inputAddonRecipe);
