import { ThemeState, type GlobalProvider } from "@ladle/react";
import "./index.css";
import { useLayoutEffect } from "react";

/**
 * Global provider for Ladle stories.
 * Imports the Panda CSS styles to make tokens available.
 */
export const Provider: GlobalProvider = ({
  children,
  globalState: { theme, control },
}) => {
  return children;
};
