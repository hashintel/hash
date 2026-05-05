import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { group } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type GroupProps = ComponentProps<typeof Group>;
export const Group = styled(ark.div, group);
