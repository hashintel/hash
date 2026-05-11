import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { badgeRecipe } from "./badge.recipe";

export type BadgeProps = ComponentProps<typeof Badge>;
export const Badge = styled(ark.div, badgeRecipe);
