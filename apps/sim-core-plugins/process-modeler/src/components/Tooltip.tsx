import MUITooltip from "@material-ui/core/Tooltip";
import { FC } from "react";

import { IconHelpCircle } from "./IconHelpCircle";

import "./Tooltip.css";

export const Tooltip: FC<{ text: string }> = ({ text }) => (
  <MUITooltip classes={{ tooltip: "Tooltip" }} interactive title={text}>
    <IconHelpCircle />
  </MUITooltip>
);
