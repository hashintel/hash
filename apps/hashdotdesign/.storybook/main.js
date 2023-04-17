module.exports = {
  stories: [
    "../../../libs/@hashintel/design-system/src/**/*.mdx",
    "../../../libs/@hashintel/design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../../../libs/@hashintel/block-design-system/src/**/*.mdx",
    "../../../libs/@hashintel/block-design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
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
