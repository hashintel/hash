import { ThemeOptions } from "@mui/material";
import { customColors } from "./palette";

const fallbackFonts = [`"Helvetica"`, `"Arial"`, "sans-serif"];

export const typography: ThemeOptions["typography"] = {
  fontFamily: [`"Inter"`, ...fallbackFonts].join(", "),
  fontSize: 16,
  hashLargeTitle: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-6)",
    fontWeight: 700,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  hashHeading1: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-5)",
    fontWeight: 600,
    lineHeight: 1.1,
    color: customColors.gray[90],
  },
  hashHeading2: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-4)",
    fontWeight: 400,
    lineHeight: 1.1,
    color: customColors.gray[90],
  },
  hashHeading4: {
    fontFamily: ["Open Sauce Two", ...fallbackFonts].join(", "),
    fontSize: "var(--step-2)",
    fontWeight: 400,
    lineHeight: 1.2,
    color: customColors.gray[80],
  },
  hashBodyCopy: {
    fontSize: "var(--step-0)",
    fontWeight: 400,
    lineHeight: 1.75,
    color: customColors.gray[80],
  },
  hashSmallText: {
    fontSize: "var(--step--1)",
    fontWeight: 400,
    color: customColors.gray[70],
    lineHeight: 1.4,
  },
  hashSmallTextMedium: {
    fontSize: "var(--step--1)",
    fontWeight: 500,
    color: customColors.gray[70],
    lineHeight: 1.4,
  },
  hashSmallCaps: {
    fontWeight: 600,
    fontSize: "var(--step--3)",
    lineHeight: 1.4,
    color: customColors.gray[80],
    textTransform: "uppercase",
  },
  hashFooterHeading: {
    fontSize: "var(--step--1)",
    fontWeight: 600,
    color: customColors.gray[80],
    lineHeight: 1.2,
  },
};
