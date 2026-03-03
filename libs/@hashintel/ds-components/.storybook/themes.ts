import { create, type ThemeVarsPartial } from "storybook/theming";

const themeBase: Partial<ThemeVarsPartial> = {
  brandUrl: "https://hash.design",
  brandTitle: "HASH Design System",
  brandTarget: "_self",
};

export const themes = {
  light: create({
    ...themeBase,
    base: "light",
    brandImage: "/hash_logo_black.svg",
  }),
  dark: create({
    ...themeBase,
    base: "dark",
    brandImage: "/hash_logo_white.svg",
  }),
};
