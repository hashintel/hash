import { defineSemanticTokens } from "@pandacss/dev";

export const surfaceGlass = defineSemanticTokens.colors({
  "50": { value: "{colors.gray.20}", description: "input:hover" },
  "60": { value: "{colors.whiteAlpha.60}", description: "container borders" },
  "70": {
    value: "{colors.whiteAlpha.70}",
    description: "inputs, button border, anything interactive",
  },
  DEFAULT: {
    value: "{colors.whiteAlpha.90}",
    description: "inputs, button border, anything interactive",
  },
  alt: { value: "{colors.whiteAlpha.60}" },
});
