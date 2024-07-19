import { create } from "@local/eslint";

export default create({
  enabled: {
    frontend: false,
    playwright: false,
    tests: false,
    storybook: false,
  },
});
