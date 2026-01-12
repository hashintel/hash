import { defineSemanticTokens } from "@pandacss/dev";

export const border = defineSemanticTokens.colors({ neutral: { hover: { value: "{colors.gray.35}" }, default: { value: "{colors.gray.20}" }, subtle: { value: "{colors.gray.20}" }, muted: { value: "{colors.gray.10}" }, active: { value: "{colors.gray.90}" }, emphasis: { value: "{colors.gray.30}" } }, status: { info: { value: "{colors.blue.10}" }, caution: { value: "{colors.yellow.10}" }, warning: { value: "{colors.orange.10}" }, critical: { value: "{colors.red.10}" }, success: { value: "{colors.green.10}" } } });
