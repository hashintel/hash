import { defineSemanticTokens } from "@pandacss/dev";

export const surfaceGlass = defineSemanticTokens.colors({
  "50": { value: "{colors.gray.20}" },
  "60": { value: "{colors.whiteAlpha.60}" },
  "70": { value: "{colors.whiteAlpha.70}" },
  default: { value: "{colors.whiteAlpha.90}" },
  alt: { value: "{colors.whiteAlpha.60}" },
});
