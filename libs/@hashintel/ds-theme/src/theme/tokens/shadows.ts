/* PLACEHOLDER IMPORTED FROM @park-ui/preset */

import { defineSemanticTokens } from "@pandacss/dev";

export const shadows = defineSemanticTokens.shadows({
  xs: {
    value: {
      _light: "0px 1px 2px {colors.gray.a60}, 0px 0px 1px {colors.gray.a70}",
      _dark:
        "0px 1px 1px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  sm: {
    value: {
      _light: "0px 2px 4px {colors.gray.a40}, 0px 0px 1px {colors.gray.a40}",
      _dark:
        "0px 2px 4px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  md: {
    value: {
      _light: "0px 4px 8px {colors.gray.a40}, 0px 0px 1px {colors.gray.a40}",
      _dark:
        "0px 4px 8px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  lg: {
    value: {
      _light: "0px 8px 16px {colors.gray.a40}, 0px 0px 1px {colors.gray.a40}",
      _dark:
        "0px 8px 16px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  xl: {
    value: {
      _light: "0px 16px 24px {colors.gray.a40}, 0px 0px 1px {colors.gray.a40}",
      _dark:
        "0px 16px 24px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  "2xl": {
    value: {
      _light: "0px 24px 40px {colors.gray.a40}, 0px 0px 1px {colors.gray.a40}",
      _dark:
        "0px 24px 40px {colors.black.a80}, 0px 0px 1px inset {colors.gray.a80}",
    },
  },
  inset: {
    value: {
      _light: "inset 8px 0 12px -8px {colors.gray.a40}",
      _dark: "inset 8px 0 12px -8px {colors.black.a60}",
    },
  },
});
