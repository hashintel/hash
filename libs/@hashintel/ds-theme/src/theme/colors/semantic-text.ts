import { defineSemanticTokens } from "@pandacss/dev";

export const text = defineSemanticTokens.colors({ primary: { value: "{colors.gray.90}" }, secondary: { value: "{colors.gray.70}" }, tertiary: { value: "{colors.gray.50}" }, disabled: { value: "{colors.gray.40}" }, inverted: { value: "{colors.neutral.white}" }, status: { info: { value: "{colors.blue.90}" }, success: { value: "{colors.green.80}" }, warning: { value: "{colors.orange.80}" }, critical: { value: "{colors.red.80}" } }, link: { value: "{colors.accent.60}" }, linkHover: { value: "{colors.accent.70}" } });
