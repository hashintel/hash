import { defineSemanticTokens } from "@pandacss/dev";

export const orange = defineSemanticTokens.colors({
  "10": { value: { _light: "#ffe0b8", _dark: "#9a3412" } },
  "20": { value: { _light: "#fed7aa", _dark: "#c2410c" } },
  "30": { value: { _light: "#fdba74", _dark: "#d97706" } },
  "40": { value: { _light: "#fb923c", _dark: "#f97316" } },
  "50": { value: { _light: "#f97316", _dark: "#fb923c" } },
  "60": { value: { _light: "#d97706", _dark: "#fdba74" } },
  "70": { value: { _light: "#c2410c", _dark: "#fed7aa" } },
  "80": { value: { _light: "#9a3412", _dark: "#ffedd5" } },
  "90": { value: { _light: "#7c2d12", _dark: "#fff7ed" } },
  "00": { value: { _light: "#fff1e0", _dark: "#7c2d12" } },
});
