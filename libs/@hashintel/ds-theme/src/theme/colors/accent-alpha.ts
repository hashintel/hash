import { defineSemanticTokens } from "@pandacss/dev";

export const accentAlpha = defineSemanticTokens.colors({
  "10": { value: { _light: "rgba(38, 121, 243, 0.043)", _dark: "#0e2e8c" } },
  "20": {
    value: {
      _light: "rgba(38, 121, 243, 0.098)",
      _dark: "rgba(21, 65, 176, 0.098)",
    },
  },
  "30": {
    value: {
      _light: "rgba(38, 121, 243, 0.165)",
      _dark: "rgba(28, 98, 227, 0.165)",
    },
  },
  "40": {
    value: {
      _light: "rgba(38, 121, 243, 0.239)",
      _dark: "rgba(38, 109, 240, 0.239)",
    },
  },
  "50": {
    value: {
      _light: "rgba(38, 121, 243, 0.326)",
      _dark: "rgba(98, 157, 240, 0.326)",
    },
  },
  "60": {
    value: {
      _light: "rgba(21, 103, 224, 0.443)",
      _dark: "rgba(163, 207, 247, 0.443)",
    },
  },
  "70": {
    value: {
      _light: "rgba(38, 121, 243, 0.631)",
      _dark: "rgba(197, 227, 250, 0.631)",
    },
  },
  "80": { value: { _light: "rgba(38, 121, 243, 0.78)", _dark: "#e5eeff" } },
  "90": {
    value: {
      _light: "rgba(38, 121, 243, 0.849)",
      _dark: "rgba(245, 251, 255, 0.849)",
    },
  },
  "00": { value: { _light: "rgba(38, 121, 243, 0.016)", _dark: "#071e69" } },
});
