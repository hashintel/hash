import { create } from "@local/eslint";

export default create({
  enabled: {
    frontend: false,
    playwright: true,
    tests: true,
  },
  noRestrictedImports: () => [
    {
      paths: [
        {
          name: "@playwright/test",
          message: "Please import from ./shared/runtime instead",
        },
      ],
    },
  ],
});
