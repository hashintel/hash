import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { linkRecipe } from "./link.recipe";

export type LinkProps = ComponentProps<typeof Link>;
export const Link = styled(ark.a, linkRecipe);
