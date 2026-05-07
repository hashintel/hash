const isStorybook = process.env.npm_lifecycle_event === "dev";

module.exports = {
  plugins: {
    "@pandacss/dev/postcss": {
      configPath: isStorybook ? "panda.storybook.config.ts" : "panda.config.ts",
    },
  },
};
