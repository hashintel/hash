import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { link } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type LinkProps = ComponentProps<typeof Link>;
export const Link = styled(ark.a, link);
