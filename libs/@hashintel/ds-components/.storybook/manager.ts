import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

addons.setConfig({
  theme: create({
    base: "light",
    brandTitle: "HASH Design System",
  }),
  panelPosition: window.matchMedia("(min-width: 1401px)").matches
    ? "right"
    : "bottom",
});
