import { defineSemanticTokens } from "@pandacss/dev";

export const purple = defineSemanticTokens.colors({
  "10": { value: { _light: "#e0d6fc", _dark: "#2d138f" } },
  "20": { value: { _light: "#c2adf8", _dark: "#401db3" } },
  "30": { value: { _light: "#a385f5", _dark: "#5429d6" } },
  "40": { value: { _light: "#865cf1", _dark: "#6633ee" } },
  "50": { value: { _light: "#6633ee", _dark: "#865cf1" } },
  "60": { value: { _light: "#5429d6", _dark: "#a385f5" } },
  "70": { value: { _light: "#401db3", _dark: "#c2adf8" } },
  "80": { value: { _light: "#2d138f", _dark: "#e0d6fc" } },
  "90": { value: { _light: "#1d0a6b", _dark: "#eee6f3" } },
  "00": { value: { _light: "#eee6f3", _dark: "#1d0a6b" } },
});
