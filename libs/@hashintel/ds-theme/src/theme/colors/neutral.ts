import { defineSemanticTokens } from "@pandacss/dev";

export const neutral = defineSemanticTokens.colors({
  white: { value: { _light: "#ffffff", _dark: "#000000" } },
  black: { value: { _light: "#000000", _dark: "#ffffff" } },
});
