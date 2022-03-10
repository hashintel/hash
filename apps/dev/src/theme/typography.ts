/**
 * @todo update from blockprotocol
 */
import { ThemeOptions, createTheme } from "@mui/material";
import { customColors } from "./palette";

const defaultTheme = createTheme();

const fallbackFonts = [`"Helvetica"`, `"Arial"`, "sans-serif"];

export const typography: ThemeOptions["typography"] = {
  fontFamily: [`"Inter"`, ...fallbackFonts].join(", "),
  fontSize: 16,
  bpTitle: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-6)",
    lineHeight: 1,
    fontWeight: 700,
    color: customColors.gray[90],
  },
  bpSubtitle: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-3)",
    lineHeight: 1.1,
    fontWeight: 200,
    color: customColors.gray[90],
  },
  bpHeading1: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-5)",
    lineHeight: 1.1,
    fontWeight: 700,
    color: customColors.gray[90],
  },
  bpHeading2: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-4)",
    fontWeight: 400,
    lineHeight: 1.2,
    color: customColors.gray[90],
  },
  bpHeading3: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-3)",
    lineHeight: 1.1,
    color: customColors.gray[80],
  },
  bpHeading4: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step-2)",
    lineHeight: 1.1,
    color: customColors.gray[80],
  },
  bpSmallCaps: {
    fontFamily: [`"Apercu Pro"`, ...fallbackFonts].join(", "),
    fontSize: "var(--step--1)",
    lineHeight: 1.3,
    color: customColors.gray[80],
    textTransform: "uppercase",
  },
  bpLargeText: {
    fontSize: "var(--step-1)",
    lineHeight: 1.1,
    color: customColors.gray[90],
  },
  bpBodyCopy: {
    fontSize: "var(--step-0)",
    fontWeight: 400,
    lineHeight: 1.7,
    color: customColors.gray[90],
    maxWidth: "62ch",
    "& a": {
      fontWeight: 600,
      transition: defaultTheme.transitions.create("color"),
      color: customColors.purple[600],
      "&:hover": {
        color: customColors.purple["600"],
      },
    },
    /** @todo: figure out how to type this */
  } as any,
  bpSmallCopy: {
    fontWeight: 500,
    fontSize: "var(--step--1)",
    lineHeight: 1.5,
    color: customColors.gray[90],
  },
  bpMicroCopy: {
    fontWeight: 500,
    fontSize: "var(--step--2)",
    lineHeight: 1.1,
    color: customColors.gray[90],
  },
};
