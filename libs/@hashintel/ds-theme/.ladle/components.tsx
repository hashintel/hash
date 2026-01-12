import { ThemeState, type GlobalProvider } from "@ladle/react";
import "./index.css";
import { useLayoutEffect } from "react";
import { NuqsAdapter } from "nuqs/adapters/react";
import {
  DefaultProps as SuspensiveDefaults,
  DefaultPropsProvider as SuspensiveDefaultsProvider,
  Suspense,
} from "@suspensive/react";

const suspensiveDefaults = new SuspensiveDefaults({
  Suspense: {
    fallback: "Loading...",
    clientOnly: true,
  },
});

/**
 * Global provider for Ladle stories.
 * Imports the Panda CSS styles to make tokens available.
 */
export const Provider: GlobalProvider = ({
  children,
  globalState: { theme, control },
}) => {
  // Control root HTML element attributes
  useLayoutEffect(() => {
    const html = document.documentElement;
    const isDark = theme === ThemeState.Dark;

    // Set class for theme
    html.classList.toggle("scheme-dark", isDark);
    html.classList.toggle("dark", isDark);
    html.classList.toggle("scheme-light", !isDark);
    html.classList.toggle("light", !isDark);

    // Set class for Radix UI themes compatibility
    html.classList.toggle("radix-themes", true);

    // Set data-theme attribute
    html.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [theme]);

  return (
    <NuqsAdapter>
      <SuspensiveDefaultsProvider defaultProps={suspensiveDefaults}>
        <Suspense>{children}</Suspense>
      </SuspensiveDefaultsProvider>
    </NuqsAdapter>
  );
};
