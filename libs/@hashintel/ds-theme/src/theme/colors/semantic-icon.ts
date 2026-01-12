import { defineSemanticTokens } from "@pandacss/dev";

export const icon = defineSemanticTokens.colors({ primary: { value: "{colors.gray.70}" }, secondary: { value: "{colors.gray.50}" }, tertiary: { value: "{colors.gray.40}" }, disabled: { value: "{colors.gray.30}" }, inverted: { value: "{colors.neutral.white}" }, link: { value: "{colors.accent.60}" }, linkHover: { value: "{colors.accent.70}" }, status: { info: { value: "{colors.blue.90}" }, success: { value: "{colors.green.80}" }, warning: { value: "{colors.orange.70}" }, critical: { value: "{colors.red.70}" } } });
