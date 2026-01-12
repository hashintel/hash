import { defineSemanticTokens } from "@pandacss/dev";

export const accentGray = defineSemanticTokens.colors({
  "10": {
    value: {
      _light: "rgba(0, 0, 0, 0.023)",
      _dark: "rgba(255, 255, 255, 0.035)",
    },
  },
  "20": { value: { _light: "rgba(0, 0, 0, 0.059)", _dark: "#ffffff" } },
  "30": { value: { _light: "rgba(0, 0, 0, 0.09)", _dark: "#ffffff" } },
  "40": { value: { _light: "rgba(0, 0, 0, 0.122)", _dark: "#ffffff" } },
  "50": { value: { _light: "rgba(0, 0, 0, 0.149)", _dark: "#ffffff" } },
  "60": { value: { _light: "rgba(0, 0, 0, 0.192)", _dark: "#ffffff" } },
  "70": { value: { _light: "rgba(0, 0, 0, 0.267)", _dark: "#ffffff" } },
  "80": { value: { _light: "rgba(0, 0, 0, 0.447)", _dark: "#ffffff" } },
  "90": { value: { _light: "rgba(0, 0, 0, 0.486)", _dark: "#ffffff" } },
  "95": { value: { _light: "rgba(0, 0, 0, 0.608)", _dark: "#ffffff" } },
  "00": {
    value: { _light: "rgba(0, 0, 0, 0.012)", _dark: "rgba(255, 255, 255, 0)" },
  },
});
