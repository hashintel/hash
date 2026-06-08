import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";
import { formWidths } from "../../util/form-width.recipe";

export const selectRecipe = sva({
  slots: [
    "wrapper",
    "trigger",
    "inputWrapper",
    "value",
    "placeholder",
    "prefix",
    "adornment",
    "loading",
    "clear",
    "clearIcon",
    "hideClear",
    "readonly",
    "connector",
    "connectRight",
    "connectLeft",
  ],
  base: {
    wrapper: {
      display: "inline-flex",
      position: "relative",
      "--base-input-connector-width": "10px",
    },
    trigger: {
      ...formWidths.base,
      display: "inline-flex",
      alignItems: "stretch",
      cursor: "pointer",
      width: "[fit-content]",
      minWidth: "[min-content]",
      position: "relative",
      background: "[var(--base-input-background-color)]",
      border: "var(--form-border-width) solid transparent",
      borderRadius: "var(--base-input-border-radius)",
      transition: "[background 0.15s ease, border 0.15s ease]",
      "--base-input-background-color": "var(--colors-white)",
      "--base-input-focus-color": "var(--colors-neutral-s40)",
      "--base-input-border-color": "var(--colors-neutral-s40)",
      "--base-input-border-hover-color": "var(--colors-neutral-s80)",
      "&[data-disabled]": { cursor: "auto" },
      "&:focus": { outline: "none" },
      "&:not(.layer-style_disabled):hover [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      "&:focus-within [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      "&::after": {
        content: '""',
        display: "block",
        alignSelf: "center",
        marginRight: "2",
        width: "[0.5em]",
        height: "[0.5em]",
        borderRight: "[1.5px solid currentColor]",
        borderBottom: "[1.5px solid currentColor]",
        color: "neutral.s100",
        transform: "[rotate(45deg) translateY(-15%)]",
        transition: "[transform 0.15s ease]",
      },
      "&[data-state='open']::after": {
        transform: "[rotate(225deg) translateY(-15%)]",
      },
    },
    readonly: {
      display: "inline",
      color: "fg.body",
    },
    inputWrapper: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      borderRadius: "var(--base-input-border-radius)",
      minWidth: "var(--form-min-width)",
      flex: "[1 1 auto]",
      width: "var(--form-width)",
      maxWidth: "var(--form-width)",
    },
    value: {
      flex: "1",
      minWidth: "0",
      width: "[100%]",
      paddingY: "var(--form-padding-y)",
      color: "[inherit]",
      borderRadius: "var(--base-input-border-radius)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    placeholder: {
      color: "neutral.s80",
    },
    prefix: {
      borderLeftRadius: "var(--base-input-border-radius)",
      borderRight: "1px solid transparent",
    },
    adornment: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      whiteSpace: "nowrap",
      color: "fg.muted",
    },
    loading: {
      alignSelf: "center",
      paddingRight: "2",
      position: "relative",
    },
    clear: {
      position: "absolute",
      zIndex: "[1]",
      right: "2",
      display: "flex",
      alignItems: "center",
      opacity: "0",
      // We set visibility and opacity because visibility prevents the clear button from being the first focus target
      // when focusing backwards but opacity allows us to add a transition animation
      visibility: "hidden",
      transition: "[opacity 0.08s ease]",
      color: "neutral.s110",
      cursor: "pointer",
      _hover: { color: "neutral.s125" },
      _focus: { _after: { background: "neutral.s30" }, outline: "none" },
      _before: {
        content: "'\\200B'",
        position: "absolute",
        paddingY: "[var(--form-padding-y)]",
        insetX: "0",
        background: "[var(--base-input-background-color)]",
        zIndex: "[-2]",
        borderRightRadius: "var(--base-input-border-radius)",
      },
      _after: {
        content: "''",
        position: "absolute",
        borderRadius: "full",
        inset: "0",
        zIndex: "[-1]",
      },
    },
    clearIcon: {
      padding: "0.5",
    },
    hideClear: {
      visibility: "hidden !important",
    },
    connector: {
      position: "absolute",
      top: "0",
      zIndex: "[1]",
      width: "var(--base-input-connector-width)",
      height: "[100%]",
      color: "var(--base-input-border-color)",
      strokeWidth: "1px",
      fill: "[var(--base-input-background-color)]",
      transition: "[fill 0.15s ease, color 0.15s ease]",
      transform: "scaleX(100.01%)",
    },
    connectRight: {
      left: "[100%]",
    },
    connectLeft: {
      right: "[100%]",
      maskImage: "[linear-gradient(to right, transparent, black)]",
    },
  },
  variants: {
    variant: {
      default: {
        trigger: {
          borderColor: "var(--base-input-border-color)",
          color: "fg.body",
          "&:not(.layer-style_disabled):hover": {
            borderColor: "var(--base-input-border-hover-color)",
            "--base-input-background-color": "var(--colors-neutral-s10)",
            "& [data-part='connector']": {
              color: "var(--base-input-border-hover-color)",
            },
          },
          "&:focus-within:not(.layer-style_disabled)": {
            outline: "[1px solid var(--base-input-focus-color)]",
          },
        },
        adornment: {
          background: "neutral.s20",
          paddingX: "2",
          borderRightColor: "var(--colors-neutral-s40)",
          borderLeftColor: "var(--colors-neutral-s40)",
        },
        value: {
          paddingX: "var(--base-input-padding-x)",
        },
      },
      subtle: {
        trigger: {
          "--base-input-border-hover-color": "var(--colors-neutral-a40)",
          "--base-input-background-color": "transparent",
          _before: {
            content: '""',
            position: "absolute",
            insetY: "[-1px]",
            insetX: "[calc(-1 * var(--base-input-padding-x))]",
            borderRadius: "var(--base-input-border-radius)",
            border: "1px solid transparent",
            pointerEvents: "none",
            background: "[var(--base-input-background-color)]",
            transition: "[background 0.15s ease, border 0.15s ease]",
          },
          "&:not(.layer-style_disabled):hover": {
            _before: {
              borderColor: "var(--base-input-border-hover-color)",
            },
          },
          "&:focus-within:not(.layer-style_disabled)": {
            "--base-input-background-color": "var(--colors-white)",
            _before: {
              borderColor: "var(--base-input-border-color)",
            },
          },
          "&::after": {
            marginRight: "0",
          },
        },
        prefix: {
          paddingLeft: "1",
          left: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
          "&[data-part='adornment-text']": {
            left: "[calc(var(--base-input-padding-x) * -0.8 + 1px)]",
          },
        },
        loading: {
          right: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
        },
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-2))]",
        },
        adornment: {
          position: "relative",
        },
      },
    },
    size: {
      xxs: {
        wrapper: { "--base-input-connector-width": "5px" },
        trigger: {
          ...formSizes.variants.sizes.xxs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
      },
      xs: {
        wrapper: { "--base-input-connector-width": "6px" },
        trigger: {
          ...formSizes.variants.sizes.xs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
      },
      sm: {
        wrapper: { "--base-input-connector-width": "8px" },
        trigger: {
          ...formSizes.variants.sizes.sm,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.2.5",
        },
      },
      md: {
        wrapper: { "--base-input-connector-width": "10px" },
        trigger: {
          ...formSizes.variants.sizes.md,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.3",
        },
      },
      lg: {
        wrapper: { "--base-input-connector-width": "12px" },
        trigger: {
          ...formSizes.variants.sizes.lg,
          "--base-input-border-radius": "radii.xl",
          "--base-input-padding-x": "spacing.4",
        },
      },
    },
    invalid: {
      true: {
        trigger: {
          "--base-input-focus-color": "var(--colors-red-s60)",
          "--base-input-border-color": "var(--colors-red-s60)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
        },
      },
    },
    disabled: {
      true: {
        trigger: {
          ...({ layerStyle: "disabled" } as Record<string, string>),
          cursor: "auto",
        },
      },
    },
    width: {
      xs: {
        trigger: { ...formWidths.variants.widths.xs },
      },
      sm: {
        trigger: { ...formWidths.variants.widths.sm },
      },
      md: {
        trigger: { ...formWidths.variants.widths.md },
      },
      lg: {
        trigger: { ...formWidths.variants.widths.lg },
      },
      fullWidth: {
        wrapper: { width: "[100%]" },
        trigger: {
          ...formWidths.variants.widths.fullWidth,
          width: "[100%]",
        },
      },
      fitContent: {
        trigger: {
          ...formWidths.variants.widths.fitContent,
          width: "[fit-content]",
        },
        readonly: { width: "[fit-content]" },
        inputWrapper: {
          display: "inline-grid",
          minWidth: "[unset]",
        },
        value: {
          gridArea: "[1 / 1]",
        },
        clear: {
          position: "relative",
          right: "[auto]",
          gridArea: "[1 / 2]",
        },
      },
    },
    align: {
      left: { value: { textAlign: "start" } },
      center: { value: { textAlign: "center" } },
      right: { value: { textAlign: "end" } },
    },
    loading: {
      true: {
        clear: {
          right: "1.5",
        },
        trigger: {
          "&::after": { display: "none" },
        },
      },
    },
    hideArrow: {
      true: {
        trigger: {
          "&::after": { display: "none" },
        },
      },
    },
    willClear: { true: {} },
    connectsRight: {
      true: {
        wrapper: {
          paddingRight: "[calc(var(--base-input-connector-width) / 2 - 1px)]",
        },
      },
    },
    connectsLeft: {
      true: {
        wrapper: {
          paddingLeft: "[calc(var(--base-input-connector-width) / 2 - 1px)]",
        },
      },
    },
  },
  compoundVariants: [
    {
      variant: "subtle",
      loading: true,
      css: {
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-1\\.5))]",
        },
      },
    },
    {
      variant: "default",
      disabled: true,
      css: {
        trigger: {
          "--base-input-border-color": "var(--colors-neutral-s50)",
          "--base-input-background-color": "var(--colors-neutral-s20)",
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "subtle",
      disabled: true,
      css: {
        trigger: {
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "default",
      size: "lg",
      css: {
        adornment: {
          paddingX: "2.5",
        },
      },
    },
    {
      variant: "default",
      invalid: true,
      css: {
        trigger: {
          "&:not(.layer-style_disabled):hover": {
            "--base-input-background-color": "var(--colors-red-s05)",
          },
        },
      },
    },
    {
      variant: "subtle",
      invalid: true,
      css: {
        trigger: {
          _before: {
            borderColor: "var(--base-input-border-color)",
          },
        },
      },
    },
    {
      variant: "subtle",
      size: "xxs",
      css: {
        trigger: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "xs",
      css: {
        trigger: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "sm",
      css: {
        trigger: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "md",
      css: {
        trigger: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "lg",
      css: {
        trigger: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
  ],
  defaultVariants: {
    variant: "default",
    size: "md",
    align: "left",
  },
});
