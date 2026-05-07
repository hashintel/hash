import { ark } from "@ark-ui/react/factory";
import { styled } from "@hashintel/ds-helpers/jsx";
import type { ComponentProps } from "react";

import { codeRecipe } from "./code.recipe";

export type CodeProps = ComponentProps<typeof Code>;
export const Code = styled(ark.code, codeRecipe);
