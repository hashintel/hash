import { defineSemanticTokens } from "@pandacss/dev";

export const surface = defineSemanticTokens.colors({
  DEFAULT: {
    value: "{colors.neutral.white}",
    description: "inputs, button border, anything interactive",
  },
  emphasis: { value: "{colors.gray.20}", description: "input:hover" },
  subtle: { value: "{colors.gray.20}", description: "container borders" },
  alt: { value: "{colors.gray.00}" },
  muted: {
    value: "{colors.gray.10}",
    description: "inputs, button border, anything interactive",
  },
  inverted: { value: "{colors.gray.90}", description: "input:hover" },
});
