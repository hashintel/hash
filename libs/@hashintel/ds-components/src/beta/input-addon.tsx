import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { inputAddonRecipe } from "./input-addon.recipe";

export type InputAddonProps = ComponentProps<typeof InputAddon>;
export const InputAddon = styled(ark.div, inputAddonRecipe);
