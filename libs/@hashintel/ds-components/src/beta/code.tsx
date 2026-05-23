import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { codeRecipe } from "./code.recipe";

import type { ComponentProps } from "react";

export type CodeProps = ComponentProps<typeof Code>;
export const Code = styled(ark.code, codeRecipe);
