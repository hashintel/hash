import { ark } from "@ark-ui/react/factory";

import { styled } from "@hashintel/ds-helpers/jsx";

import { absoluteCenter } from "./absolute-center.recipe";

import type { ComponentProps } from "react";

export type AbsoluteCenterProps = ComponentProps<typeof AbsoluteCenter>;
export const AbsoluteCenter = styled(ark.div, absoluteCenter);
