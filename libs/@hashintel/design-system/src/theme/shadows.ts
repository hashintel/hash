import { Shadows, ThemeOptions } from "@mui/material";

type ShadowSizes = {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
  purpleShadowMd: string;
};

const content = {
  none: "none",
  xs: ["0px 1px 5px rgba(27, 33, 40, 0.07)"],
  sm: [
    "0px 4px 11px rgba(39, 50, 86, 0.04)",
    "0px 2.59259px 6.44213px rgba(39, 50, 86, 0.08)",
    "0px 0.5px 1px rgba(39, 50, 86, 0.15)",
  ],
  md: [
    "0px 11px 30px rgba(61, 78, 133, 0.04)",
    "0px 7.12963px 18.37px rgba(61, 78, 133, 0.05)",
    "0px 4.23704px 8.1px rgba(61, 78, 133, 0.06)",
    "0px 0.203704px 0.62963px rgba(61, 78, 133, 0.07)",
  ],
  mdReverse: [
    "0px -11px 30px rgba(61, 78, 133, 0.04)",
    "0px -7.12963px 18.37px rgba(61, 78, 133, 0.05)",
    "0px -4.23704px 8.1px rgba(61, 78, 133, 0.06)",
    "0px -0.203704px 0.62963px rgba(61, 78, 133, 0.07)",
  ],
  lg: [
    "0px 20px 41px rgba(61, 78, 133, 0.07)",
    "0px 16px 25px rgba(61, 78, 133, 0.0531481)",
    "0px 12px 12px rgba(61, 78, 133, 0.0325)",
    "0px 2px 3.13px rgba(61, 78, 133, 0.02)",
  ],
  xl: [
    "0px 51px 87px rgba(50, 65, 111, 0.07)",
    "0px 33.0556px 50.9514px rgba(50, 65, 111, 0.0531481)",
    "0px 19.6444px 27.7111px rgba(50, 65, 111, 0.0425185)",
    "0px 10.2px 14.1375px rgba(50, 65, 111, 0.035)",
    "0px 4.15556px 7.08889px rgba(50, 65, 111, 0.0274815)",
    "0px 0.944444px 3.42361px rgba(50, 65, 111, 0.0168519)",
  ],
  xxl: [
    "0px 96px 129px rgba(61, 78, 133, 0.13)",
    "0px 48.6px 56.2359px rgba(61, 78, 133, 0.08775)",
    "0px 19.2px 20.9625px rgba(61, 78, 133, 0.065)",
    "0px 4.2px 7.45781px rgba(61, 78, 133, 0.04225)",
  ],
  purpleShadowMd: [
    "0px 1px 1px rgba(85, 50, 195, 0.35)",
    "0px 2px 7px 2px rgba(141, 104, 248, 0.2)",
    "0px 6px 18px 5px rgba(113, 63, 255, 0.15)",
    "0px 4px 30px 2px rgba(113, 63, 255, 0.08)",
    "inset 0px -4px 8px rgba(85, 75, 160, 0.3)",
  ],
};

// converts each shadow to it's drop shadow equivalent
const toDropShadow = (size: keyof Omit<ShadowSizes, "none">) => {
  let result = "";

  for (const item of content[size]) {
    result += `drop-shadow(${item})`;
  }

  return result;
};

export const shadows: ThemeOptions["shadows"] = [
  "none",
  content.xs.join(","),
  content.sm.join(","),
  content.md.join(","),
  content.lg.join(","),
  content.xl.join(","),
  content.xxl.join(","),
  /**
   * MUI expects to have exactly 26 shadows, whereas our design system only specifies 5.
   * We therefore repeat the darkest shadow to fill the remaining shadows.
   */
  ...Array(19).fill(content.xxl.join(",")),
] as Shadows;

export const boxShadows = {
  none: "none",
  xs: content.xs.join(","),
  sm: content.sm.join(","),
  md: content.md.join(","),
  mdReverse: content.mdReverse.join(","),
  lg: content.lg.join(","),
  xl: content.xl.join(","),
  xxl: content.xxl.join(","),
  purpleShadowMd: content.purpleShadowMd.join(","),
};

export const dropShadows = {
  none: content.none,
  xs: toDropShadow("xs"),
  sm: toDropShadow("sm"),
  md: toDropShadow("md"),
  lg: toDropShadow("lg"),
  xl: toDropShadow("xl"),
  xxl: toDropShadow("xxl"),
  purpleShadowMd: toDropShadow("purpleShadowMd"),
};
