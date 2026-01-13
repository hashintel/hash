import { defineSemanticTokens } from "@pandacss/dev";

export const bg = defineSemanticTokens.colors({
  accent: {
    subtle: {
      default: { value: "{colors.accent.00}" },
      hover: { value: "{colors.accent.10}" },
      active: { value: "{colors.accent.00}" },
    },
    bold: {
      default: { value: "{colors.accent.50}" },
      hover: { value: "{colors.accent.60}" },
      pressed: { value: "{colors.accent.60}" },
      active: { value: "{colors.accent.50}" },
    },
  },
  neutral: {
    subtle: {
      default: { value: "{colors.neutral.white}" },
      hover: { value: "{colors.gray.10}" },
      active: { value: "{colors.gray.20}" },
      pressed: { value: "{colors.gray.10}" },
    },
    bold: {
      default: { value: "{colors.gray.80}" },
      hover: { value: "{colors.gray.70}" },
      active: { value: "{colors.gray.80}" },
      pressed: { value: "{colors.gray.70}" },
    },
  },
  status: {
    info: {
      subtle: {
        default: { value: "{colors.blue.00}" },
        hover: { value: "{colors.blue.10}" },
        active: { value: "{colors.blue.00}" },
      },
    },
    success: {
      subtle: {
        default: { value: "{colors.green.00}" },
        hover: { value: "{colors.green.10}" },
        active: { value: "{colors.green.00}" },
      },
    },
    caution: {
      subtle: {
        default: { value: "{colors.yellow.00}" },
        hover: { value: "{colors.yellow.10}" },
        active: { value: "{colors.yellow.00}" },
      },
    },
    warning: {
      subtle: {
        default: { value: "{colors.orange.00}" },
        hover: { value: "{colors.orange.10}" },
        active: { value: "{colors.orange.00}" },
      },
    },
    critical: {
      subtle: {
        default: { value: "{colors.red.00}" },
        hover: { value: "{colors.red.10}" },
        active: { value: "{colors.red.00}" },
      },
      strong: {
        default: { value: "{colors.red.50}" },
        hover: { value: "{colors.red.60}" },
        active: { value: "{colors.red.50}" },
      },
    },
  },
});
