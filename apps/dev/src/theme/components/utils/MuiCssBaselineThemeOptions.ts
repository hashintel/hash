/**
 * @todo update from blockprotocol
 */
// @todo use more descriptive names instead of --step-1, --step-2
// wouldn't need this when this is in

import { Components } from "@mui/material";

// import { DESKTOP_NAVBAR_HEIGHT } from "../../../components/Navbar";
import { customColors } from "../../palette";

const DESKTOP_NAVBAR_HEIGHT = 71.5;

// @see https://github.com/mui-org/material-ui/issues/15251
const rootTypographyStyles = `
  /* @link https://utopia.fyi/type/calculator?c=320,16,1.25,1140,18,1.25,6,2,&s=0.75|0.5|0.25,1.5|2|3|4|6,s-l */

  :root {
    --fluid-min-width: 320;
    --fluid-max-width: 1140;

    --fluid-screen: 100vw;
    --fluid-bp: calc(
      (var(--fluid-screen) - var(--fluid-min-width) / 16 * 1rem) /
        (var(--fluid-max-width) - var(--fluid-min-width))
    );
  }

  @media screen and (min-width: 1140px) {
    :root {
      --fluid-screen: calc(var(--fluid-max-width) * 1px);
    }
  }

  :root {
    --f--2-min: 13;
    --f--2-max: 14;
    --step--2: calc(
      ((var(--f--2-min) / 16) * 1rem) + (var(--f--2-max) - var(--f--2-min)) *
        var(--fluid-bp)
    );

    --f--1-min: 14.50;
    --f--1-max: 15.50;
    --step--1: calc(
      ((var(--f--1-min) / 16) * 1rem) + (var(--f--1-max) - var(--f--1-min)) *
        var(--fluid-bp)
    );

    --f-0-min: 16.00;
    --f-0-max: 18.00;
    --step-0: calc(
      ((var(--f-0-min) / 16) * 1rem) + (var(--f-0-max) - var(--f-0-min)) *
        var(--fluid-bp)
    );

    --f-1-min: 20.00;
    --f-1-max: 22.50;
    --step-1: calc(
      ((var(--f-1-min) / 16) * 1rem) + (var(--f-1-max) - var(--f-1-min)) *
        var(--fluid-bp)
    );

    --f-2-min: 25.00;
    --f-2-max: 28.13;
    --step-2: calc(
      ((var(--f-2-min) / 16) * 1rem) + (var(--f-2-max) - var(--f-2-min)) *
        var(--fluid-bp)
    );

    --f-3-min: 31.25;
    --f-3-max: 35.16;
    --step-3: calc(
      ((var(--f-3-min) / 16) * 1rem) + (var(--f-3-max) - var(--f-3-min)) *
        var(--fluid-bp)
    );

    --f-4-min: 39.06;
    --f-4-max: 43.95;
    --step-4: calc(
      ((var(--f-4-min) / 16) * 1rem) + (var(--f-4-max) - var(--f-4-min)) *
        var(--fluid-bp)
    );

    --f-5-min: 43.95;
    --f-5-max: 54.93;
    --step-5: calc(
      ((var(--f-5-min) / 16) * 1rem) + (var(--f-5-max) - var(--f-5-min)) *
        var(--fluid-bp)
    );

    --f-6-min: 54.93;
    --f-6-max: 68.66;
    --step-6: calc(
      ((var(--f-6-min) / 16) * 1rem) + (var(--f-6-max) - var(--f-6-min)) *
        var(--fluid-bp)
    );
  }
`;

export const MuiCssBaselineThemeOptions: Components["MuiCssBaseline"] = {
  styleOverrides: `
          @font-face {
            font-family: 'Inter';
            font-weight: 300;
            src: url("/assets/fonts/inter-light.ttf") format("trueType");
          }
          @font-face {
              font-family: 'Inter';
              font-weight: 400;
              src: url("/assets/fonts/inter-regular.ttf") format("trueType");
          }
          @font-face {
              font-family: 'Inter';
              font-weight: 500;
              src: url("/assets/fonts/inter-medium.ttf") format("trueType");
          }
          @font-face {
            font-family: 'Inter';
            font-weight: 600;
            src: url("/assets/fonts/inter-semibold.ttf") format("trueType");
          }
          @font-face {
            font-family: 'Inter';
            font-weight: 700;
            src: url("/assets/fonts/inter-bold.ttf") format("trueType");
          }
          @font-face {
            font-family: 'Apercu Pro';
            font-weight: 300;
            src: url("/assets/fonts/apercu-light-pro.ttf") format("trueType");
          }
          @font-face {
              font-family: 'Apercu Pro';
              font-weight: 400;
              src: url("/assets/fonts/apercu-regular-pro.ttf") format("trueType");
          }
          @font-face {
              font-family: 'Apercu Pro';
              font-weight: 500;
              src: url("/assets/fonts/apercu-medium-pro.ttf") format("trueType");
          }
          @font-face {
            font-family: 'Apercu Pro';
            font-weight: 700;
            src: url("/assets/fonts/apercu-bold-pro.ttf") format("trueType");
          }

          html {
            scroll-behavior: smooth;
          }

          body {
            overflow: auto;${
              "" /** @todo: find a pernament solution for preventing the navbar from shifting to the right when a modal is opened on an overflowing page */
            }
          }

          body, p {
            font-size: var(--step-0);
            font-weight: 400;
            line-height: 1.7;
            color: ${customColors.gray[90]};
          }

          pre {
            margin: unset;
          }

          :target:before {
            content: "";
            display: block;
            height: ${DESKTOP_NAVBAR_HEIGHT}px;
            margin: -${DESKTOP_NAVBAR_HEIGHT}px 0 0;
          }

          ${rootTypographyStyles}
        `,
};
