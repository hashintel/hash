import { defineSemanticTokens } from "@pandacss/dev";

export const bg = defineSemanticTokens.colors({
  accent: {
    subtle: {
      DEFAULT: {
        value: "{colors.accent.00}",
        description: "inputs, button border, anything interactive",
      },
      hover: { value: "{colors.accent.10}" },
      active: { value: "{colors.accent.00}", description: "container borders" },
    },
    bold: {
      DEFAULT: {
        value: "{colors.accent.50}",
        description: "inputs, button border, anything interactive",
      },
      hover: { value: "{colors.accent.60}" },
      pressed: {
        value: "{colors.accent.60}",
        description: "container borders",
      },
      active: { value: "{colors.accent.50}", description: "container borders" },
    },
  },
  neutral: {
    subtle: {
      DEFAULT: { value: "{colors.neutral.white}" },
      hover: { value: "{colors.gray.10}" },
      active: { value: "{colors.gray.20}" },
      pressed: { value: "{colors.gray.10}" },
    },
    bold: {
      DEFAULT: {
        value: "{colors.gray.80}",
        description: "inputs, button border, anything interactive",
      },
      hover: { value: "{colors.gray.70}" },
      active: { value: "{colors.gray.80}", description: "container borders" },
      pressed: { value: "{colors.gray.70}", description: "container borders" },
    },
  },
  status: {
    info: {
      subtle: {
        DEFAULT: {
          value: "{colors.blue.00}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.blue.10}" },
        active: { value: "{colors.blue.00}", description: "container borders" },
      },
    },
    success: {
      subtle: {
        DEFAULT: {
          value: "{colors.green.00}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.green.10}" },
        active: {
          value: "{colors.green.00}",
          description: "container borders",
        },
      },
    },
    caution: {
      subtle: {
        DEFAULT: {
          value: "{colors.yellow.00}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.yellow.10}" },
        active: {
          value: "{colors.yellow.00}",
          description: "container borders",
        },
      },
    },
    warning: {
      subtle: {
        DEFAULT: {
          value: "{colors.orange.00}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.orange.10}" },
        active: {
          value: "{colors.orange.00}",
          description: "container borders",
        },
      },
    },
    critical: {
      subtle: {
        DEFAULT: {
          value: "{colors.red.00}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.red.10}" },
        active: { value: "{colors.red.00}", description: "container borders" },
      },
      strong: {
        DEFAULT: {
          value: "{colors.red.50}",
          description: "inputs, button border, anything interactive",
        },
        hover: { value: "{colors.red.60}" },
        active: { value: "{colors.red.50}", description: "container borders" },
      },
    },
  },
});
