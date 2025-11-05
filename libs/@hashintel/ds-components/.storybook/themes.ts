import { create, type ThemeVarsPartial } from "storybook/theming";

const themeBase: Partial<ThemeVarsPartial> = {
  brandTitle: "HASH Design System",
  brandUrl: "https://hash.design",
};

export const themes = {
  light: create({
    ...themeBase,
    base: "light",
    brandImage: "/hash_logo_black.svg",
    brandTarget: "_self",
  }),
  dark: create({
    ...themeBase,
    base: "dark",
    brandImage: "/hash_logo_white.svg",
    brandTarget: "_self",
  }),
};
