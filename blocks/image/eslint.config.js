import { create } from "@local/eslint";

export default create({
  enabled: {
    frontend: "react",
    playwright: false,
    tests: false,
  },
});
