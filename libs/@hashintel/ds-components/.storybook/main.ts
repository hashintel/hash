import remarkGfm from "remark-gfm";

import { rehypeMarkdownClass } from "./rehype-markdown-class";
import { remarkStageCode } from "./remark-stage-code";

import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.docs.mdx"],
  addons: [
    {
      name: "@storybook/addon-docs",
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm, remarkStageCode],
            rehypePlugins: [rehypeMarkdownClass],
          },
        },
      },
    },
  ],
  staticDirs: ["./static"],
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true,
    enableCrashReports: false,
  },
  features: {
    sidebarOnboardingChecklist: false,
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      // react-docgen-typescript names every component in a file after the
      // first top-level `X.displayName = "…"` string literal it finds, then
      // dedupes docs by name — collapsing multi-component files (Banner,
      // Icon, Popover…) to a single prop table. Name docs by export symbol
      // instead; runtime displayName assignments are unaffected.
      componentNameResolver: (exp) => exp.getName(),
      // The plugin defaults to injecting `X.displayName = "<doc name>"` after
      // each module, which would overwrite hand-set displayNames
      // (e.g. "Form.Field") with export names.
      setDisplayName: false,
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Keep prop tables on the public API: drop inherited DOM/aria props
      // (the node_modules check the default filter would otherwise apply)
      // plus styling/plumbing props, mostly mirroring preview.tsx's controls.exclude.
      // `never`-typed props (e.g. Button's anchor/button variant exclusions)
      // extract as type "undefined" and would render as junk rows.
      propFilter: (prop) =>
        (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true) &&
        prop.type.name !== "undefined" &&
        prop.type.name !== "never" &&
        !/^(className|contentClassName|positionerClassName|style|ref|inputRef|testId|htmlForId|data-.+)$/.test(
          prop.name,
        ),
    },
  },
};

export default config;
