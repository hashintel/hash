import type { GlobalProvider } from "@ladle/react";
import "./index.css";

/**
 * Global provider for Ladle stories.
 * Imports the Panda CSS styles to make tokens available.
 */
export const Provider: GlobalProvider = ({ children }) => <>{children}</>;
