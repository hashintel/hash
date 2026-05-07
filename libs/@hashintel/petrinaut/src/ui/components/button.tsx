import {
  Button as DsButton,
  type ButtonProps as DsButtonProps,
} from "@hashintel/ds-components";

import { withTooltip } from "./hoc/with-tooltip";

export type ButtonProps = DsButtonProps;

export const Button = withTooltip(DsButton, "block");
