import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { badgeRecipe } from "./badge.recipe";

import type { ComponentProps } from "react";

export type BadgeProps = ComponentProps<typeof Badge>;
export const Badge = styled(ark.div, badgeRecipe);
