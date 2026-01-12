import { defineSemanticTokens } from "@pandacss/dev";

export const pink = defineSemanticTokens.colors({
  "10": { value: { _light: "#fce7f3", _dark: "#9d174d" } },
  "20": { value: { _light: "#fbcfe8", _dark: "#be185d" } },
  "30": { value: { _light: "#f9a8d4", _dark: "#db2777" } },
  "40": { value: { _light: "#f174b2", _dark: "#ec4899" } },
  "50": { value: { _light: "#ec4899", _dark: "#f174b2" } },
  "60": { value: { _light: "#db2777", _dark: "#f9a8d4" } },
  "70": { value: { _light: "#be185d", _dark: "#fbcfe8" } },
  "80": { value: { _light: "#9d174d", _dark: "#fce7f3" } },
  "90": { value: { _light: "#831843", _dark: "#fdf2f8" } },
  "00": { value: { _light: "#fdf2f8", _dark: "#831843" } },
});
