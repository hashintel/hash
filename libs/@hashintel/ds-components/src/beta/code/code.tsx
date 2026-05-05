import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import { code } from "@hashintel/ds-helpers/recipes";
import type { ComponentProps } from "react";

export type CodeProps = ComponentProps<typeof Code>;
export const Code = styled(ark.code, code);
