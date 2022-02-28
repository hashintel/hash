import { ThemeOptions } from "@mui/material";
import { customColors } from "./palette";

const fallbackFonts = [`"Helvetica"`, `"Arial"`, "sans-serif"];

export const typography: ThemeOptions["typography"] = {
  fontFamily: [`"Inter"`, ...fallbackFonts].join(", "),
  fontSize: 16,
  htmlFontSize: 16,

  // HEADERS
  title: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-6)",
    lineHeight: 1.1,
    fontWeight: 600,
  },
  h1: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-5)",
    lineHeight: 1.1,
    fontWeight: 500,
  },
  h2: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-4)",
    fontWeight: 500,
    lineHeight: 1.2,
  },
  h3: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-3)",
    fontWeight: 500,
    lineHeight: 1.2,
  },
  h4: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-2)",
    fontWeight: 500,
    lineHeight: 1.2,
  },
  h5: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-1)",
    fontWeight: 500,
    lineHeight: 1.2,
  },
  mediumCaps: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-0)",
    fontWeight: 500,
    lineHeight: "18px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  smallCaps: {
    fontSize: "var(--step--3)",
    fontWeight: 600,
    lineHeight: "18px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },

  // BODY TEXT
  largeTextLabels: {
    fontSize: "var(--step-1)",
    lineHeight: "24px",
    fontWeight: 400,
  },
  regularTextParagraphs: {
    fontSize: "var(--step-0)",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  regularTextLabels: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: "24px",
  },
  smallCopy: {
    fontWeight: 500,
    fontSize: "var(--step--1)",
    lineHeight: 1.5,
    color: customColors.gray["80"],
  },
  smallSecondaryCopy: {
    fontWeight: 500,
    fontSize: "var(--step--1)",
    lineHeight: 1.5,
    color: customColors.gray["50"],
  },
  microCopy: {
    fontWeight: 500,
    fontSize: "var(--step--2)",
    lineHeight: 1.1,
    color: customColors.gray["80"],
  },
  smallTextParagraphs: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: 1.5,
  },
  smallTextLabels: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: "18px",
  },
  microText: {
    fontSize: "var(--step--2)",
    fontWeight: 400,
    lineHeight: "18px",
  },
  // Disable unused defaults
  h6: undefined,
  subtitle1: undefined,
  subtitle2: undefined,
  body1: undefined,
  body2: undefined,
  caption: undefined,
  button: undefined,
  overline: undefined,
};
