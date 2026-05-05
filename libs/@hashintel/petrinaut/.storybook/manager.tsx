import { addons } from "storybook/manager-api";
import { create } from "storybook/theming/create";

addons.setConfig({
  theme: create({
    base: "dark",
    brandTitle: "Petrinaut",
    brandImage: "logo.png",
  }),
});
