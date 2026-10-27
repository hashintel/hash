import remarkGfm from "remark-gfm";

import { docgenParserOptions } from "../docs/docgen-options";
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
      // Parser options are shared with the published docgen registry so
      // PropsTable renders identically in Storybook and in dist/docs.
      ...docgenParserOptions,
      // The plugin defaults to injecting `X.displayName = "<doc name>"` after
      // each module, which would overwrite hand-set displayNames
      // (e.g. "Form.Field") with export names.
      setDisplayName: false,
    },
  },
};

export default config;
