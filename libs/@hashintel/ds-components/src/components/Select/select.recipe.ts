import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";
import { formWidths } from "../../util/form-width.recipe";

export const selectRecipe = sva({
  slots: [
    "wrapper",
    "select",
    "trigger",
    "triggerWrapper",
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
    "list",
  ],
  base: {
    wrapper: {
      ...formWidths.base,
      display: "inline-flex",
      position: "relative",
    },
    select: {
      display: "inline-flex",
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
      "&:has([data-disabled])": { cursor: "auto" },
      "& [data-part='trigger']:focus": { outline: "none" },
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
        marginLeft: "var(--base-input-padding-x)",
        marginRight: "var(--base-input-padding-x)",
        width: "[0.5em]",
        height: "[0.5em]",
        borderRight: "[1.5px solid currentColor]",
        borderBottom: "[1.5px solid currentColor]",
        color: "neutral.s100",
        transform: "[rotate(45deg) translateY(-15%)]",
        flex: "[0 0 auto]",
      },
    },
    readonly: {
      display: "inline",
    },
    triggerWrapper: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      borderRadius: "var(--base-input-border-radius)",
      minWidth: "var(--form-min-width)",
      flex: "[1 1 auto]",
      width: "var(--form-width)",
      maxWidth: "var(--form-width)",
    },
    trigger: {
      flex: "1",
      minWidth: "0",
      width: "[100%]",
      paddingY: "var(--form-padding-y)",
      display: "inline",
      alignItems: "center",
      appearance: "none",
      outline: "0",
      border: "none",
      bg: "[inherit]",
      color: "[inherit]",
      borderRadius: "var(--base-input-border-radius)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      "&[data-placeholder-shown]": { color: "neutral.s80" },
    },
    adornment: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      whiteSpace: "nowrap",
      color: "fg.muted",
      position: "relative",
    },
    loading: {
      alignSelf: "center",
      position: "relative",
    },
    clear: {
      position: "absolute",
      zIndex: "[1]",
      right: "-1",
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
    list: {
      ...formWidths.base,
      width: "var(--reference-width)",
      maxWidth: "var(--reference-width)",
      minWidth: "[var(--form-min-width) !important]",
    },
  },
  variants: {
    variant: {
      default: {
        select: {
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
        trigger: {
          paddingLeft: "var(--base-input-padding-x)",
        },
        prefix: {
          paddingLeft: "2",
        },
      },
      subtle: {
        select: {
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
            marginRight: "[calc(var(--base-input-padding-x) / 2)]",
          },
        },
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-1))]",
        },
        prefix: {
          paddingLeft: "1",
          left: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
          "&[data-part='adornment-text']": {
            left: "[calc(var(--base-input-padding-x) * -0.8 + 1px)]",
          },
        },
        list: {
          width:
            "[calc(var(--reference-width) + var(--base-input-padding-x) * 2)]",
          maxWidth:
            "[calc(var(--reference-width) + var(--base-input-padding-x) * 2)]",
          marginLeft: "[calc(-1 * var(--base-input-padding-x))]",
        },
      },
    },
    size: {
      xxs: {
        wrapper: {
          ...formSizes.variants.sizes.xxs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xxs.textStyle },
      },
      xs: {
        wrapper: {
          ...formSizes.variants.sizes.xs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xs.textStyle },
      },
      sm: {
        wrapper: {
          ...formSizes.variants.sizes.sm,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.2.5",
        },
        readonly: { textStyle: formSizes.variants.sizes.sm.textStyle },
      },
      md: {
        wrapper: {
          ...formSizes.variants.sizes.md,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.3",
        },
        readonly: { textStyle: formSizes.variants.sizes.md.textStyle },
      },
      lg: {
        wrapper: {
          ...formSizes.variants.sizes.lg,
          "--base-input-border-radius": "radii.xl",
          "--base-input-padding-x": "spacing.4",
        },
        readonly: { textStyle: formSizes.variants.sizes.lg.textStyle },
      },
    },
    invalid: {
      true: {
        select: {
          "--base-input-focus-color": "var(--colors-red-s60)",
          "--base-input-border-color": "var(--colors-red-s60)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
        },
      },
    },
    disabled: {
      true: {
        select: {
          ...({ layerStyle: "disabled" } as Record<string, string>),
          cursor: "auto",
          "&::after": {
            color: "neutral.s80",
          },
        },
      },
    },
    width: {
      xs: {
        select: { ...formWidths.variants.widths.xs },
      },
      sm: {
        select: { ...formWidths.variants.widths.sm },
      },
      md: {
        select: { ...formWidths.variants.widths.md },
      },
      lg: {
        select: { ...formWidths.variants.widths.lg },
      },
      fullWidth: {
        wrapper: { width: "[100%]" },
        select: {
          ...formWidths.variants.widths.fullWidth,
          width: "[100%]",
        },
      },
      fitContent: {
        select: {
          ...formWidths.variants.widths.fitContent,
          width: "[fit-content]",
        },
        readonly: { width: "[fit-content]" },
        triggerWrapper: {
          display: "inline-grid",
          minWidth: "[unset]",
        },
        trigger: {
          gridArea: "[1 / 1]",
        },
        clear: {
          position: "relative",
          right: "[auto]",
          gridArea: "[1 / 2]",
        },
        list: {
          width: "[auto]",
          maxWidth: "[auto]",
        },
      },
    },
    align: {
      left: { trigger: { textAlign: "start", justifyContent: "flex-start" } },
      center: { trigger: { textAlign: "center", justifyContent: "center" } },
      right: { trigger: { textAlign: "end", justifyContent: "flex-end" } },
    },
    loading: {
      true: {
        clear: {
          right: "1",
        },
      },
    },
    hideArrow: {
      true: {
        select: {
          "&::after": { display: "none" },
        },
      },
    },
    willClear: { true: {} },
    hasPrefix: { true: {} },
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
    customRender: {
      true: {
        trigger: {
          display: "inline-flex",
        },
      },
    },
    clampTriggerHeight: {
      true: {
        trigger: {
          maxHeight:
            "[calc(var(--form-line-height) + 2 * var(--form-padding-y))]",
        },
      },
    },
  },
  compoundVariants: [
    {
      variant: "default",
      hasPrefix: true,
      css: {
        trigger: {
          paddingLeft: "[calc(var(--base-input-padding-x) * 3 / 4)]",
        },
      },
    },
    {
      variant: "subtle",
      loading: true,
      css: {
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-2\\.5))]",
        },
      },
    },
    {
      variant: "default",
      disabled: true,
      css: {
        select: {
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
        select: {
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "default",
      invalid: true,
      css: {
        select: {
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
        select: {
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
        select: {
          "--base-input-padding-x": "spacing.2",
        },
        list: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "xs",
      css: {
        select: {
          "--base-input-padding-x": "spacing.2",
        },
        list: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "sm",
      css: {
        select: {
          "--base-input-padding-x": "spacing.2",
        },
        list: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "md",
      css: {
        select: {
          "--base-input-padding-x": "spacing.2",
        },
        list: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "lg",
      css: {
        select: {
          "--base-input-padding-x": "spacing.2",
        },
        list: {
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
