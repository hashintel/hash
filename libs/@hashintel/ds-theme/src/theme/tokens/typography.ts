import { defineTokens } from "@pandacss/dev";

export const fonts = defineTokens.fonts({ display: { value: "Inter Display" }, body: { value: "Inter" } });

export const fontWeights = defineTokens.fontWeights({ normal: { value: 400 }, medium: { value: 500 }, semibold: { value: 600 } });

export const fontSizes = defineTokens.fontSizes({ "3xl": { value: "30px" }, sm: { value: "14px" }, base: { value: "16px" }, xs: { value: "12px" }, xl: { value: "20px" }, lg: { value: "18px" }, "2xl": { value: "24px" }, "4xl": { value: "36px" } });

export const lineHeights = defineTokens.lineHeights({ none: { "text-3xl": { value: "{fontSizes.3xl}" }, "text-sm": { value: "{fontSizes.sm}" }, "text-xs": { value: "{fontSizes.xs}" }, "text-base": { value: "{fontSizes.base}" }, "text-lg": { value: "{fontSizes.lg}" } }, normal: { "text-xs": { value: "18px" }, "text-sm": { value: "21px" }, "text-base": { value: "24px" }, "text-lg": { value: "27px" } } });
