import { sva } from "@hashintel/ds-helpers/css";

import { srOnly } from "../../util/css-mixins";

export const styles = sva({
  slots: ["container", "root", "control", "label", "input"],
  base: {
    root: {
      position: "relative",
      display: "inline-flex",
      width: "[fit-content]",
      gap: "[6px]",
      cursor: "pointer",
      lineHeight: "[1.2]",
      "&:has(input:disabled)": {
        cursor: "unset",
        color: "neutral.s75",
      },
    },
    control: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      color: "neutral.s00",
      backgroundColor: "white",
      borderRadius: "[50%]",
      border: "[1px solid var(--colors-neutral-a60)]",
      transition: "[background-color 0.07s ease, border-color 0.07s ease]",

      "&::after": {
        content: '""',
        borderRadius: "[50%]",
        backgroundColor: "[currentColor]",
        opacity: "[var(--radio-dot-opacity, 0)]",
        transition: "[opacity 0.07s ease]",
      },
      "input:checked ~ &": {
        "--radio-dot-opacity": "1",
      },
      "input:not(:checked) ~ &": {
        boxShadow: "[inset 0 1px 1px var(--colors-neutral-a30)]",
      },
      "input:focus-visible ~ &": {
        outline: "[1px solid var(--colors-neutral-s80)]",
      },
      "input:disabled ~ &": {
        backgroundColor: "neutral.a20",
        borderColor: "neutral.a45",
        boxShadow: "[none]",
      },
      "label:not(:has(input:disabled)):hover input:not(:checked) ~ &": {
        backgroundColor: "neutral.a20",
        borderColor: "neutral.a70",
      },
    },
    label: {
      alignSelf: "center",
    },
    input: srOnly,
  },
  variants: {
    size: {
      xxs: {
        root: { gap: "[6px]", fontSize: "[11px]", marginBlock: "[-1.5px]" },
        control: {
          width: "[12px]",
          height: "[12px]",
          marginBlock: "[1.5px]",
          "&::after": { width: "[5px]", height: "[5px]" },
        },
      },
      xs: {
        root: { gap: "[8px]", fontSize: "[12px]", marginBlock: "[-1.5px]" },
        control: {
          width: "[14px]",
          height: "[14px]",
          marginBlock: "[1.5px]",
          "&::after": { width: "[6px]", height: "[6px]" },
        },
      },
      sm: {
        root: { gap: "[8px]", fontSize: "[14px]", marginBlock: "[-1.5px]" },
        control: {
          width: "[16px]",
          height: "[16px]",
          marginBlock: "[1.5px]",
          "&::after": { width: "[7px]", height: "[7px]" },
        },
      },
      md: {
        root: { gap: "[10px]", fontSize: "[15px]", marginBlock: "[-2px]" },
        control: {
          width: "[18px]",
          height: "[18px]",
          marginBlock: "[2px]",
          "&::after": { width: "[8px]", height: "[8px]" },
        },
      },
      lg: {
        root: { gap: "[12px]", fontSize: "[17px]", marginBlock: "[-2px]" },
        control: {
          width: "[20px]",
          height: "[20px]",
          marginBlock: "[2px]",
          "&::after": { width: "[9px]", height: "[9px]" },
        },
      },
    },
    tone: {
      neutral: {
        control: {
          "input:checked ~ &": {
            backgroundColor: "neutral.s120",
            borderColor: "neutral.s120",
          },
          "input:checked:disabled ~ &": {
            backgroundColor: "neutral.s90",
            borderColor: "neutral.s90",
          },
          "label:not(:has(input:disabled)):hover input:checked ~ &": {
            backgroundColor: "neutral.s110",
            borderColor: "neutral.s110",
          },
        },
      },
      brand: {
        control: {
          "input:checked ~ &": {
            backgroundColor: "blue.s85",
            borderColor: "blue.s85",
          },
          "input:checked:disabled ~ &": {
            backgroundColor: "blue.s55",
            borderColor: "blue.s55",
          },
          "label:not(:has(input:disabled)):hover input:checked ~ &": {
            backgroundColor: "blue.s75",
            borderColor: "blue.s75",
          },
        },
      },
      success: {
        control: {
          "input:checked ~ &": {
            backgroundColor: "green.s85",
            borderColor: "green.s85",
          },
          "input:checked:disabled ~ &": {
            backgroundColor: "green.s55",
            borderColor: "green.s55",
          },
          "label:not(:has(input:disabled)):hover input:checked ~ &": {
            backgroundColor: "green.s70",
            borderColor: "green.s70",
          },
        },
      },
    },
    invalid: {
      true: {
        control: {
          borderColor: "red.s70 !important",
          "input:not(:checked) ~ &": {
            boxShadow: "[inset 0px 1px 1px var(--colors-red-a30)]",
          },
          "input:focus-visible ~ &": {
            outline: "[1px solid var(--colors-red-s50)]",
          },
          "label:not(:has(input:disabled)):hover input:not(:checked) ~ &": {
            borderColor: "red.a60 !important",
          },
        },
      },
      false: {},
    },
    labelPlacement: {
      left: {
        root: { flexDirection: "row-reverse" },
      },
      right: {},
    },
    labelAlign: {
      top: {
        root: { alignItems: "flex-start" },
      },
      center: {
        root: { alignItems: "center" },
      },
    },
  },
  defaultVariants: {
    size: "md",
    tone: "neutral",
    invalid: false,
    labelPlacement: "right",
    labelAlign: "top",
  },
});
