import { defineSemanticTokens } from "@pandacss/dev";

export const whiteAlpha = defineSemanticTokens.colors({
  "10": {
    value: {
      _light: "rgba(255, 255, 255, 0.1)",
      _dark: "rgba(0, 0, 0, 0.035)",
    },
  },
  "20": { value: { _light: "rgba(255, 255, 255, 0.2)", _dark: "#000000" } },
  "30": { value: { _light: "rgba(255, 255, 255, 0.3)", _dark: "#ffffff" } },
  "40": { value: { _light: "rgba(255, 255, 255, 0.4)", _dark: "#ffffff" } },
  "50": { value: { _light: "rgba(255, 255, 255, 0.5)", _dark: "#ffffff" } },
  "60": { value: { _light: "rgba(255, 255, 255, 0.6)", _dark: "#ffffff" } },
  "70": { value: { _light: "rgba(255, 255, 255, 0.7)", _dark: "#ffffff" } },
  "80": { value: { _light: "rgba(255, 255, 255, 0.8)", _dark: "#ffffff" } },
  "90": { value: { _light: "rgba(255, 255, 255, 0.9)", _dark: "#ffffff" } },
  "95": { value: { _light: "rgba(255, 255, 255, 0.95)", _dark: "#ffffff" } },
  "00": {
    value: { _light: "rgba(255, 255, 255, 0)", _dark: "rgba(0, 0, 0, 0)" },
  },
});
