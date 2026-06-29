import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "control", "indicator", "label"],
  base: {
    root: {
      display: "inline-flex",
      width: "[fit-content]",
      gap: "[6px]",
      cursor: "pointer",
      lineHeight: "[1]",
      "&[data-disabled]": {
        cursor: "unset",
        color: "neutral.s75",
      },
      "&[data-focus-visible] [data-part='control']": {
        outline: "[1px solid var(--colors-neutral-s80)]",
      },
      "&:hover:not([data-disabled]) [data-part='control'][data-state='unchecked']":
        {
          backgroundColor: "neutral.a20",
          borderColor: "neutral.a70",
        },
    },
    control: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      color: "neutral.s00",
      backgroundColor: "white",
      borderRadius: "sm",
      border: "[1px solid var(--colors-neutral-a60)]",
      transition: "[background-color 0.07s ease, border-color 0.07s ease]",
      "&[data-state='unchecked']": {
        boxShadow: "[inset 0 1px 1px var(--colors-neutral-a30)]",
      },
      "&[data-disabled]": {
        backgroundColor: "neutral.a20",
        borderColor: "neutral.a45",
        boxShadow: "[none]",
      },
    },
    label: {
      alignSelf: "center",
    },
  },
  variants: {
    size: {
      xxs: {
        root: { gap: "[6px]", fontSize: "[11px]", marginBlock: "[-0.5px]" },
        control: { width: "[12px]", height: "[12px]", marginBlock: "[0.5px]" },
        indicator: { width: "[9px]", height: "[9px]" },
      },
      xs: {
        root: { gap: "[8px]", fontSize: "[12px]", marginBlock: "[-0.5px]" },
        control: { width: "[14px]", height: "[14px]", marginBlock: "[0.5px]" },
        indicator: { width: "[10px]", height: "[10px]" },
      },
      sm: {
        root: { gap: "[8px]", fontSize: "[13px]", marginBlock: "[-0.5px]" },
        control: { width: "[15px]", height: "[15px]", marginBlock: "[0.5px]" },
        indicator: { width: "[11px]", height: "[11px]" },
      },
      md: {
        root: { gap: "[10px]", fontSize: "[14px]", marginBlock: "[-0.5px]" },
        control: { width: "[16px]", height: "[16px]", marginBlock: "[0.5px]" },
        indicator: { width: "[12px]", height: "[12px]" },
      },
      lg: {
        root: { gap: "[10px]", fontSize: "[15px]" },
        control: { width: "[18px]", height: "[18px]" },
        indicator: { width: "[14px]", height: "[14px]" },
      },
    },
    tone: {
      neutral: {
        control: {
          "&[data-state='checked'], &[data-state='indeterminate']": {
            backgroundColor: "neutral.s120",
            borderColor: "neutral.s120",
          },
          "&[data-disabled][data-state='checked'], &[data-disabled][data-state='indeterminate']":
            {
              backgroundColor: "neutral.s90 !important",
              borderColor: "neutral.s90 !important",
            },
        },
        root: {
          "&:hover:not([data-disabled]) [data-part='control'][data-state='checked'], &:hover:not([data-disabled]) [data-part='control'][data-state='indeterminate']":
            {
              backgroundColor: "neutral.s110",
              borderColor: "neutral.s110",
            },
        },
      },
      brand: {
        control: {
          "&[data-state='checked'], &[data-state='indeterminate']": {
            backgroundColor: "blue.s85",
            borderColor: "blue.s85",
          },
          "&[data-disabled][data-state='checked'], &[data-disabled][data-state='indeterminate']":
            {
              backgroundColor: "blue.s55 !important",
              borderColor: "blue.s55 !important",
            },
        },
        root: {
          "&:hover:not([data-disabled]) [data-part='control'][data-state='checked'], &:hover:not([data-disabled]) [data-part='control'][data-state='indeterminate']":
            {
              backgroundColor: "blue.s75",
              borderColor: "blue.s75",
            },
        },
      },
      success: {
        control: {
          "&[data-state='checked'], &[data-state='indeterminate']": {
            backgroundColor: "green.s80",
            borderColor: "green.s80",
          },
          "&[data-disabled][data-state='checked'], &[data-disabled][data-state='indeterminate']":
            {
              backgroundColor: "green.s55 !important",
              borderColor: "green.s55 !important",
            },
        },
        root: {
          "&:hover:not([data-disabled]) [data-part='control'][data-state='checked'], &:hover:not([data-disabled]) [data-part='control'][data-state='indeterminate']":
            {
              backgroundColor: "green.s70",
              borderColor: "green.s70",
            },
        },
      },
    },
    invalid: {
      true: {
        root: {
          "&[data-focus-visible] [data-part='control']": {
            outline: "[1px solid var(--colors-red-s50)]",
          },
          "&:hover:not([data-disabled]) [data-part='control'][data-state='unchecked']":
            {
              borderColor: "red.a60 !important",
            },
        },
        control: {
          borderColor: "red.s70 !important",
          "&[data-state='unchecked']": {
            boxShadow: "[inset 0px 1px 1px var(--colors-red-a30)]",
          },
        },
      },
      false: {},
    },
    labelDirection: {
      right: {
        root: { flexDirection: "row-reverse" },
      },
      left: {},
    },
    // Vertical alignment of the box against the label, relevant when the label
    // wraps over multiple lines: "top" aligns the box with the first line.
    alignLabel: {
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
    labelDirection: "left",
    alignLabel: "top",
  },
});
