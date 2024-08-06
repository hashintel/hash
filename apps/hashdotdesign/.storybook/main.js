import { dirname, join } from "path";
module.exports = {
  stories: [
    "../../../libs/@hashintel/design-system/src/**/*.mdx",
    "../../../libs/@hashintel/design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
    "../../../libs/@hashintel/block-design-system/src/**/*.mdx",
    "../../../libs/@hashintel/block-design-system/src/**/*.stories.@(js|jsx|ts|tsx)",
  ],

  addons: [
    getAbsolutePath("@storybook/addon-links"),
    getAbsolutePath("@storybook/addon-essentials"),
    getAbsolutePath("@storybook/addon-interactions"),
    "@storybook/addon-webpack5-compiler-babel"
  ],

  framework: {
    name: getAbsolutePath("@storybook/react-webpack5"),
    options: {},
  },

  core: {
    disableTelemetry: true,
  },

  docs: {
    docsPage: true,
  },

  typescript: {
    reactDocgen: "react-docgen-typescript"
  }
};

function getAbsolutePath(value) {
  return dirname(require.resolve(join(value, "package.json")));
}
