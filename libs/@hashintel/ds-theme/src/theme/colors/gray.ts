import { defineSemanticTokens } from "@pandacss/dev";

export const gray = defineSemanticTokens.colors({
  "10": { value: { _light: "#f5f5f5", _dark: "#1d2836" } },
  "20": { value: { _light: "#e5e5e5", _dark: "#374151" } },
  "30": { value: { _light: "#d9d9d9", _dark: "#4b5563" } },
  "35": { value: { _light: "#c7c7c7", _dark: "#4b5563" } },
  "40": { value: { _light: "#a3a3a3", _dark: "#6b7280" } },
  "50": { value: { _light: "#737373", _dark: "#9ca3af" } },
  "60": { value: { _light: "#525252", _dark: "#dde0e4" } },
  "70": { value: { _light: "#404040", _dark: "#e5e7eb" } },
  "80": { value: { _light: "#262626", _dark: "#f0f2f4" } },
  "90": { value: { _light: "#171717", _dark: "#f6f8f9" } },
  "95": { value: { _light: "#0a0a0a", _dark: "#f6f8f9" } },
  "00": { value: { _light: "#fafafa", _dark: "#070a0d" } },
});
