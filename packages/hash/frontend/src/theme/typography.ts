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
    color: customColors.gray[90],
  },
  h1: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-5)",
    lineHeight: 1.1,
    fontWeight: 500,
    color: customColors.gray[90],
  },
  h2: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-4)",
    fontWeight: 500,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  h3: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-3)",
    fontWeight: 500,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  h4: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-2)",
    fontWeight: 500,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  h5: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-1)",
    fontWeight: 500,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  mediumCaps: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-0)",
    fontWeight: 500,
    lineHeight: "18px",
    letterSpacing: "0.05em",
    color: customColors.gray[90],
    textTransform: "uppercase",
  },
  smallCaps: {
    fontSize: "var(--step--3)",
    fontWeight: 600,
    lineHeight: "18px",
    letterSpacing: "0.05em",
    color: customColors.gray[90],
    textTransform: "uppercase",
  },

  // BODY TEXT
  regularTextParagraphs: {
    fontSize: "var(--step-0)",
    fontWeight: 400,
    lineHeight: 1.5,
    color: customColors.gray[90],
  },
  regularTextLabels: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: "24px",
    color: customColors.gray[90],
  },
  smallTextParagraphs: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: 1.5,
    color: customColors.gray[90],
  },
  smallTextLabels: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    lineHeight: "18px",
    color: customColors.gray[90],
  },
  microText: {
    fontSize: "var(--step--2)",
    fontWeight: 400,
    lineHeight: "18px",
    color: customColors.gray[90],
  },
};
