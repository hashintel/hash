import remarkGfm from "remark-gfm";

import { rehypeMarkdownClass } from "./rehype-markdown-class";

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
            remarkPlugins: [remarkGfm],
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
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Keep prop tables on the public API: drop inherited DOM/aria props
      // (the node_modules check the default filter would otherwise apply)
      // plus styling/plumbing props and event handlers, mirroring
      // preview.tsx's controls.exclude.
      propFilter: (prop) =>
        (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true) &&
        !/^(className|contentClassName|positionerClassName|style|ref|inputRef|testId|htmlForId|on[A-Z].*)$/.test(
          prop.name,
        ),
    },
  },
};

export default config;
