import { defineSemanticTokens } from "@pandacss/dev";

export const green = defineSemanticTokens.colors({
  "10": { value: { _light: "#e4f7f3", _dark: "#096638" } },
  "20": { value: { _light: "#b9ebdf", _dark: "#0e7d4b" } },
  "30": { value: { _light: "#91dbc9", _dark: "#159663" } },
  "40": { value: { _light: "#4fc29e", _dark: "#19a874" } },
  "50": { value: { _light: "#19a874", _dark: "#4fc29e" } },
  "60": { value: { _light: "#159663", _dark: "#91dbc9" } },
  "70": { value: { _light: "#0e7d4b", _dark: "#b9ebdf" } },
  "80": { value: { _light: "#096638", _dark: "#e4f7f3" } },
  "90": { value: { _light: "#054d27", _dark: "#edfaf7" } },
  "00": { value: { _light: "#edfaf7", _dark: "#054d27" } },
});
