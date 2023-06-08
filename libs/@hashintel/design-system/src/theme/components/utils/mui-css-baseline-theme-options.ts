import { Components } from "@mui/material";

import {
  fluidFontClassName,
  fluidTypographyStyles,
} from "../../../fluid-fonts";
import { customColors } from "../../palette";

const typographyVariableSelector = `:root, .${fluidFontClassName}`;

export const MuiCssBaselineThemeOptions: Components["MuiCssBaseline"] = {
  styleOverrides: `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }


          html {
            scroll-behavior: smooth;
          }

          body {
            overflow-x: hidden !important;
          }          

          body, p {
            font-size: var(--step-0);
            font-weight: 400;
            line-height: 1.7;
            color: ${customColors.gray["90"]};
          }

          a {
            text-decoration: none;
          }

          ${fluidTypographyStyles(typographyVariableSelector)}
        `,
};
