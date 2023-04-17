module.exports = {
  stories: [
    "../../@hashintel/design-system/src/**/*.mdx",
    "../../@hashintel/design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../../@hashintel/block-design-system/src/**/*.mdx",
    "../../@hashintel/block-design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  docs: {
    docsPage: true,
  },
};
