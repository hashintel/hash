import { defineSemanticTokens } from "@pandacss/dev";

export const surface = defineSemanticTokens.colors({
  default: { value: "{colors.neutral.white}" },
  emphasis: { value: "{colors.gray.20}" },
  subtle: { value: "{colors.gray.20}" },
  alt: { value: "{colors.gray.00}" },
  muted: { value: "{colors.gray.10}" },
  inverted: { value: "{colors.gray.90}" },
});
