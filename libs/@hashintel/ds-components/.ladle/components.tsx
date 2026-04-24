import { ThemeState, type GlobalProvider } from "@ladle/react";
import { useLayoutEffect } from "react";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";

import "./index.css";

/**
 * Global provider for Ladle stories.
 * Applies theme class to root element and imports Panda CSS styles.
 */
export const Provider: GlobalProvider = ({
  children,
  globalState: { theme },
}) => {
  useLayoutEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove("light", "dark");

    // Apply theme class based on Ladle's theme state
    if (theme === ThemeState.Dark) {
      root.classList.add("dark");
    } else if (theme === ThemeState.Light) {
      root.classList.add("light");
    }
    // ThemeState.Auto will use system preference via CSS media queries
  }, [theme]);

  return children;
};
