import { create } from "storybook/theming";

const themBase = {
  brandTitle: "HASH Design System",
  brandUrl: "https://hash.design",
};
export const themes = {
  light: create({
    ...themBase,
    base: "light",
    brandImage: "/hash_logo_black.svg",
    brandTarget: "_self",
  }),
  dark: create({
    ...themBase,
    base: "dark",
    brandImage: "/hash_logo_white.svg",
    brandTarget: "_self",
  }),
};
