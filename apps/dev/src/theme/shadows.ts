/**
 * @todo update from blockprotocol
 */
import { ThemeOptions } from "@mui/material";
import { Shadows } from "@mui/material/styles/shadows";

/** @todo: see if it's possible to use keys "sm" | "lg" instead of the array index */

const bpShadows = [
  "none",
  "0px 2px 8px rgba(39, 50, 86, 0.04), 0px 2.59259px 6.44213px rgba(39, 50, 86, 0.06), 0px 0.5px 1px rgba(39, 50, 86, 0.10)",
  "0px 9px 26px rgba(61, 78, 133, 0.03), 0px 7.12963px 18.37px rgba(61, 78, 133, 0.04), 0px 4.23704px 8.1px rgba(61, 78, 133, 0.05), 0px 0.203704px 0.62963px rgba(61, 78, 133, 0.06)",
  "0px 20px 41px rgba(61, 78, 133, 0.04), 0px 16px 25px rgba(61, 78, 133, 0.03), 0px 12px 12px rgba(61, 78, 133, 0.02), 0px 2px 3.13px rgba(61, 78, 133, 0.01)",
  "0px 51px 87px rgba(50, 65, 111, 0.07), 0px 33.0556px 50.9514px rgba(50, 65, 111, 0.0531481), 0px 19.6444px 27.7111px rgba(50, 65, 111, 0.0425185), 0px 10.2px 14.1375px rgba(50, 65, 111, 0.035), 0px 4.15556px 7.08889px rgba(50, 65, 111, 0.0274815), 0px 0.944444px 3.42361px rgba(50, 65, 111, 0.0168519)",
  "0px 96px 129px rgba(61, 78, 133, 0.13), 0px 48.6px 56.2359px rgba(61, 78, 133, 0.08775), 0px 19.2px 20.9625px rgba(61, 78, 133, 0.065), 0px 4.2px 7.45781px rgba(61, 78, 133, 0.04225)",
] as const;

export const shadows: ThemeOptions["shadows"] = [
  ...bpShadows,
  /**
   * MUI expects to have exactly 26 shadows, whereas our design system only specifies 5.
   * We therefore repeat the darkest shadow to fill the remaining shadows.
   */
  ...Array(20).fill(bpShadows.slice(-1)[0]),
] as Shadows;
