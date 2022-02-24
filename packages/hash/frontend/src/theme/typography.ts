import { ThemeOptions } from "@mui/material";
import { customColors } from "./palette";

const fallbackFonts = [`"Helvetica"`, `"Arial"`, "sans-serif"];

export const typography: ThemeOptions["typography"] = {
  fontFamily: [`"Inter"`, ...fallbackFonts].join(", "),
  fontSize: 16,

  title: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-6)",
    fontSize: 61,
    lineHeight: 1.1,
    fontWeight: 700,
    color: customColors.gray["80"],
  },
  h1: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-5)",
    fontSize: 48.8,
    lineHeight: 1.1,
    fontWeight: 700,
    color: customColors.gray["80"],
  },
  h2: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-4)",
    fontSize: 39,
    fontWeight: 400,
    lineHeight: 1.2,
    color: customColors.gray["80"],
  },
  h3: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-3)",
    fontSize: 31.5,
    lineHeight: 1.2,
    color: customColors.gray["70"],
  },
  h4: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-2)",
    fontSize: 24,
    lineHeight: 1.3,
    color: customColors.gray["70"],
  },
  h5: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step-2)",
    fontSize: 20,
    lineHeight: 1.2,
    color: customColors.gray["70"],
  },
  mediumCaps: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    // fontSize: "var(--step--1)",
    fontSize: 16,
    lineHeight: 1.3,
    color: customColors.gray["70"],
    textTransform: "uppercase",
  },
  smallCaps: {
    // fontSize: "var(--step-1)",
    fontSize: 12,
    lineHeight: 1.5,
    color: customColors.gray["80"],
  },
  regularTextParagraphs: {
    // fontSize: "var(--step-0)",
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
    color: customColors.gray["80"],
  },
  regularTextLabels: {
    fontWeight: 500,
    // fontSize: "var(--step--1)",
    fontSize: 16,
    lineHeight: 1.1,
    color: customColors.gray["80"],
  },
  smallTextParagraphs: {
    // fontSize: "var(--step-0)",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    color: customColors.gray["80"],
  },
  smallTextLabels: {
    fontWeight: 500,
    // fontSize: "var(--step--1)",
    fontSize: 14,
    lineHeight: 1.3,
    color: customColors.gray["80"],
  },
  microText: {
    fontWeight: 500,
    // fontSize: "var(--step--2)",
    fontSize: 13,
    lineHeight: 1.4,
    color: customColors.gray["80"],
  },
};
