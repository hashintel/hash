import { defineSemanticTokens } from "@pandacss/dev";

export const border = defineSemanticTokens.colors({
  neutral: {
    hover: { value: "{colors.gray.35}", description: "input:hover" },
    DEFAULT: {
      value: "{colors.gray.20}",
      description: "inputs, button border, anything interactive",
    },
    subtle: { value: "{colors.gray.20}", description: "container borders" },
    muted: { value: "{colors.gray.10}" },
    active: { value: "{colors.gray.90}", description: "input:hover" },
    emphasis: { value: "{colors.gray.30}", description: "container borders" },
  },
  status: {
    info: { value: "{colors.blue.10}" },
    caution: { value: "{colors.yellow.10}" },
    warning: { value: "{colors.orange.10}" },
    critical: { value: "{colors.red.10}" },
    success: { value: "{colors.green.10}" },
  },
});
