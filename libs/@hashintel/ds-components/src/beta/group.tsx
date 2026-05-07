import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { groupRecipe } from "./group.recipe";

export type GroupProps = ComponentProps<typeof Group>;
export const Group = styled(ark.div, groupRecipe);
