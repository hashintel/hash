import "@fontsource-variable/geist-mono";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "./preview.css";
import "./docs.css";
import { DocsContainer } from "@storybook/addon-docs/blocks";
import { GLOBALS_UPDATED, SET_GLOBALS } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";

import { resolveTheme, systemDark } from "./resolve-theme";

import type { Decorator, Preview } from "@storybook/react-vite";

/**
 * Applies the selected color scheme the same way the app shell does: a
 * `light`/`dark` class on the root element drives the Panda theme conditions.
 * The preset's conditions are class-based with no `prefers-color-scheme`
 * fallback, so `auto` is resolved against the OS preference here (and tracks
 * OS changes live). The theme global is consumed via channel events rather
 * than only a decorator because decorators don't wrap MDX docs pages.
 */
let selectedTheme = "light";

const applyTheme = () => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolveTheme(selectedTheme));
};

const setTheme = (theme: unknown) => {
  if (typeof theme === "string" && theme.length > 0) {
    selectedTheme = theme;
  }
  applyTheme();
};

systemDark.addEventListener("change", applyTheme);

const onGlobals = (payload: { globals?: Record<string, unknown> }) => {
  setTheme(payload.globals?.["theme"]);
};
const channel = addons.getChannel();
channel.on(SET_GLOBALS, onGlobals);
channel.on(GLOBALS_UPDATED, onGlobals);

const withTheme: Decorator = (Story, context) => {
  setTheme(context.globals["theme"]);
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Color scheme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "auto", title: "System" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      // One sb-unstyled wrapper opts the whole docs page out of addon-docs'
      // typography; docs.css styles the markdown back in via the hash-md
      // class the MDX build stamps on markdown-derived elements, so doc
      // blocks and example JSX need no per-block escape.
      container: ({
        children,
        ...containerProps
      }: React.ComponentProps<typeof DocsContainer>) => (
        <DocsContainer {...containerProps}>
          <div className="hash-docs-root sb-unstyled">{children}</div>
        </DocsContainer>
      ),
    },
    controls: {
      // Hide plumbing props and event handlers from the controls panel;
      // the real API controls are inferred from the component types.
      exclude:
        /^(className|contentClassName|positionerClassName|style|ref|inputRef|testId|htmlForId|on[A-Z].*)$/,
    },
    options: {
      storySort: {
        order: ["Tokens", "Components", "Primitives", "Legacy", "*"],
      },
    },
  },
};

export default preview;
