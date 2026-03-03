import { global } from "@storybook/global";

const { window: globalWindow } = global;

/**
 * NOTE: this function is taken from Storybook's source code:
 *
 * Uses the CSS media query `prefers-color-scheme: dark` to detect if the user
 * has configured their system to prefer dark themes. Falls back to 'light'
 * if the media query API is not available or if the global window object
 * is not accessible.
 *
 * @returns The preferred color scheme, either 'dark' or 'light'
 */
export const getPreferredColorScheme = () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!globalWindow?.matchMedia) {
    return "light";
  }

  const isDarkThemePreferred = globalWindow.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;

  return isDarkThemePreferred ? "dark" : "light";
};
