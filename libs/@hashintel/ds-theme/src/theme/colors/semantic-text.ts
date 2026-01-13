import { defineSemanticTokens } from "@pandacss/dev";

export const text = defineSemanticTokens.colors({
  primary: {
    value: "{colors.gray.90}",
    description:
      "Primary color for text and icons in any given interface. It should be used for titles and labels.",
  },
  secondary: {
    value: "{colors.gray.70}",
    description:
      "Use for content that is secondary or that provides additional context but is not critical to understanding the flow of an interface. Body text",
  },
  tertiary: {
    value: "{colors.gray.50}",
    description: "Use for secondary text, icons",
  },
  disabled: {
    value: "{colors.gray.40}",
    description: "Use for secondary text, icons",
  },
  inverted: { value: "{colors.neutral.white}" },
  status: {
    info: {
      value: "{colors.blue.90}",
      description: "Use for interactive text or icons like links or buttons.",
    },
    success: {
      value: "{colors.green.80}",
      description: "Use to emphasize a positive message.",
    },
    warning: {
      value: "{colors.orange.80}",
      description:
        "Use to highlight elements that require a user's attention or pending statuses.",
    },
    critical: {
      value: "{colors.red.80}",
      description: "Use to emphasize content for an error. Action is required.",
    },
  },
  link: { value: "{colors.accent.60}" },
  linkHover: { value: "{colors.accent.70}" },
});
