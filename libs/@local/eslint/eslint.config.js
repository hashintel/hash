import { create } from "./dist/index.js";

export default create({
  enabled: {
    frontend: false,
    playwright: false,
    tests: false,
  },
  noRestrictedImports: () => [],
});
