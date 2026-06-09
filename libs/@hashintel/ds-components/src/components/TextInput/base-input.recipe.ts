import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";
import { formWidths } from "../../util/form-width.recipe";

export const baseInputRecipe = sva({
  slots: [
    "wrapper",
    "root",
    "inputWrapper",
    "input",
    "hiddenInput",
    "prefix",
    "suffix",
    "adornment",
    "adornmentButton",
    "adornmentText",
    "adornmentInteractive",
    "disabledButton",
    "loading",
    "editIcon",
    "clear",
    "clearIcon",
    "hideClear",
    "styledValueOverlay",
    "readonly",
    "connector",
    "connectRight",
    "connectLeft",
    "connectAdornment",
  ],
  base: {
    wrapper: {
      ...formWidths.base,
      display: "inline-flex",
      position: "relative",
    },
    root: {
      display: "inline-flex",
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
      "&:not(.layer-style_disabled):hover [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      "&:focus-within [data-part='clear']": {
        opacity: "1",
        visibility: "visible",
      },
      "&:focus-within [data-part='edit']": {
        display: "none",
      },
    },
    readonly: {
      display: "inline",
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
      "&:hover [data-part='edit']": {
        color: "fg.body",
      },
    },
    input: {
      flex: "1",
      minWidth: "0",
      width: "[100%]",
      paddingY: "var(--form-padding-y)",
      appearance: "none",
      outline: "0",
      border: "none",
      bg: "[inherit]",
      color: "[inherit]",
      borderRadius: "var(--base-input-border-radius)",
      _placeholder: { color: "neutral.s80" },
      _disabled: { cursor: "auto" },

      // Hide the number step controls in safari + chrome when not focused.
      // Use opacity (not appearance) so the controls still reserve layout
      // space — otherwise the input would grow when focus reveals them.
      "&[type=number]:not(:focus)::-webkit-outer-spin-button, &[type=number]:not(:focus)::-webkit-inner-spin-button":
        {
          opacity: 0,
          pointerEvents: "none",
        },
      // Firefox exposes no public selector for the spin buttons, so we can't
      // reserve their space. Hide them permanently to keep the width stable.
      "&[type=number]": {
        // @ts-expect-error moz-appearance is a valid firefox property
        "-moz-appearance": "textfield",
      },
    },
    hiddenInput: {
      color: "[transparent]",
      caretColor: "[transparent]",
    },
    prefix: {
      borderLeftRadius: "var(--base-input-border-radius)",
      borderRight: "1px solid transparent",
    },
    suffix: {
      borderRightRadius: "var(--base-input-border-radius)",
      borderLeft: "1px solid transparent",
    },
    adornment: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      whiteSpace: "nowrap",
    },
    adornmentButton: {
      color: "fg.body",
      cursor: "pointer",
      padding: "0",
      transition:
        "[background 0.15s ease, border 0.15s ease, color 0.15s ease]",
      "&:not([disabled]):hover": {
        background: "neutral.s30",
        color: "neutral.s120",
      },
      "&:not([disabled]):hover + [data-part='connector']": {
        fill: "[var(--colors-neutral-s30)]",
      },
      "&:not([disabled]):active": {
        background: "neutral.s40",
        color: "neutral.s125",
      },
      "&:not([disabled]):active + [data-part='connector']": {
        fill: "neutral.s40",
      },
      "&:focus:not(:focus-visible)": { outline: "none" },
      _focusVisible: {
        outline: "[1px solid var(--colors-neutral-s80)]",
        outlineOffset: "0",
        background: "neutral.s25",
      },
      "&:focus-visible + [data-part='connector']": {
        fill: "neutral.s25",
      },
    },
    adornmentInteractive: {
      transition:
        "[background 0.15s ease, border 0.15s ease, color 0.15s ease]",
      _focusWithin: {
        outline: "[1px solid var(--colors-neutral-s80)]",
        outlineOffset: "0",
        background: "neutral.s25",
      },
    },
    disabledButton: {
      cursor: "auto",
      color: "fg.muted",
    },
    adornmentText: {
      color: "fg.muted",
    },
    loading: {
      alignSelf: "center",
      paddingRight: "2",
      position: "relative",
    },
    editIcon: {
      position: "absolute",
      zIndex: "[1]",
      right: "2",
      paddingX: "0.5",
      display: "flex",
      alignItems: "center",
      color: "fg.muted",
      cursor: "pointer",
      _before: {
        content: "'\\200B'",
        position: "absolute",
        paddingY: "[var(--form-padding-y)]",
        insetX: "0",
        background: "[var(--base-input-background-color)]",
        zIndex: "[-2]",
        borderRightRadius: "var(--base-input-border-radius)",
      },
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
    styledValueOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      pointerEvents: "none",
      overflow: "hidden",
      paddingY: "var(--form-padding-y)",
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
      // Fixes subpixel rounding error in safari
      transform: "scaleX(100.01%)",
    },
    connectRight: {
      left: "[100%]",
    },
    connectLeft: {
      right: "[100%]",
      maskImage: "[linear-gradient(to right, transparent, black)]",
    },
    connectAdornment: {
      fill: "[var(--colors-neutral-s20)]",
    },
  },
  variants: {
    variant: {
      default: {
        root: {
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
        adornmentButton: {
          borderRightColor: "var(--colors-neutral-s40)",
          borderLeftColor: "var(--colors-neutral-s40)",
        },
        input: {
          paddingX: "var(--base-input-padding-x)",
        },
        styledValueOverlay: {
          paddingX: "var(--base-input-padding-x)",
        },
      },
      subtle: {
        root: {
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
          "&:not(.layer-style_disabled):hover [data-part='edit']": {
            visibility: "hidden",
          },
        },
        prefix: {
          paddingLeft: "1",
          left: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
          "&[data-part='adornment-text']:not([data-interactive='true'])": {
            left: "[calc(var(--base-input-padding-x) * -0.8 + 1px)]",
          },
        },
        suffix: {
          paddingRight: "1",
          right: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
          "&[data-part='adornment-text']:not([data-interactive='true'])": {
            right: "[calc(var(--base-input-padding-x) * -0.8 + 1px)]",
          },
        },
        loading: {
          right: "[calc(var(--base-input-padding-x) * -1 + 1px)]",
        },
        editIcon: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-2))]",
        },
        clear: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-2))]",
        },
        adornment: {
          position: "relative",
        },
        adornmentButton: {
          paddingX: "1",
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
        root: {
          "--base-input-focus-color": "var(--colors-red-s60)",
          "--base-input-border-color": "var(--colors-red-s60)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
        },
      },
    },
    disabled: {
      true: {
        root: {
          ...({ layerStyle: "disabled" } as Record<string, string>),
          cursor: "auto",
        },
      },
    },
    width: {
      xs: {
        wrapper: { ...formWidths.variants.widths.xs },
      },
      sm: {
        wrapper: { ...formWidths.variants.widths.sm },
      },
      md: {
        wrapper: { ...formWidths.variants.widths.md },
      },
      lg: {
        wrapper: { ...formWidths.variants.widths.lg },
      },
      fullWidth: {
        wrapper: {
          ...formWidths.variants.widths.fullWidth,
          width: "[100%]",
        },
        root: {
          width: "[100%]",
        },
      },
      fitContent: {
        wrapper: { ...formWidths.variants.widths.fitContent },
        root: {
          width: "[fit-content]",
        },
        readonly: { width: "[fit-content]" },
        inputWrapper: {
          display: "inline-grid",
          minWidth: "[unset]",
        },
        input: {
          gridArea: "[1 / 1]",
          fieldSizing: "content",
          "&[type=number]::-webkit-outer-spin-button, &[type=number]::-webkit-inner-spin-button":
            {
              marginLeft: "1.5",
            },
        },
        clear: {
          position: "relative",
          right: "[auto]",
          gridArea: "[1 / 2]",
        },
        editIcon: {
          position: "relative",
          right: "[auto]",
          gridArea: "[1 / 2]",
        },
      },
    },
    align: {
      left: { input: { textAlign: "start" } },
      center: { input: { textAlign: "center" } },
      right: { input: { textAlign: "end" } },
    },
    loading: {
      true: {
        clear: {
          right: "1.5",
        },
        editIcon: {
          right: "1.5",
        },
      },
    },
    willClear: { true: {} },
    editAndClear: {
      true: {
        editIcon: {
          _before: {
            left: "[calc(var(--spacing-1\\.5) * -1 - 1px)]",
          },
        },
      },
    },
    hasIcons: { true: {} },
    hasBrowserControls: {
      true: {
        clear: {
          position: "relative",
          right: "1",
          gridArea: "[1 / 2]",
        },
        editIcon: {
          paddingX: "0.5",
        },
      },
    },
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
        editIcon: {
          right:
            "[calc(var(--base-input-padding-x) * -1 + 1px + var(--spacing-1\\.5))]",
        },
      },
    },
    {
      variant: "default",
      disabled: true,
      css: {
        root: {
          "--base-input-border-color": "var(--colors-neutral-s50)",
          "--base-input-background-color": "var(--colors-neutral-s20)",
          color: "neutral.s80",
          "&:after": {
            content: "''",
            position: "absolute",
            inset: "[-1px]",
            borderRadius: "var(--base-input-border-radius)",
            pointerEvents: "none",
            transition: "[border 0.15s ease]",
          },
          "&:has([data-part='adornment-button']:not([disabled]):hover)::after, &:has([data-part='adornment-text'][data-interactive]:hover)::after":
            {
              border: "1px solid var(--base-input-border-hover-color)",
            },
          "&:has([data-part='adornment-button']:not([disabled]):focus-visible)::after, &:has([data-part='adornment-text'][data-interactive]:focus-within)::after":
            {
              border: "1px solid var(--base-input-border-hover-color)",
              outline: "[1px solid var(--base-input-focus-color)]",
            },
        },
      },
    },
    {
      variant: "subtle",
      disabled: true,
      css: {
        root: {
          color: "neutral.s80",
          "&:has([data-part='adornment-button']:not([disabled]):hover)::before, &:has([data-part='adornment-text'][data-interactive]:hover)::before":
            {
              borderColor: "var(--base-input-border-hover-color)",
            },
          "&:has([data-part='adornment-button']:not([disabled]):focus-visible)::before, &:has([data-part='adornment-text'][data-interactive]:focus-within)::before":
            {
              borderColor: "var(--base-input-border-color)",
            },
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
        root: {
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
        root: {
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
        root: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "xs",
      css: {
        root: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "sm",
      css: {
        root: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "md",
      css: {
        root: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      variant: "subtle",
      size: "lg",
      css: {
        root: {
          "--base-input-padding-x": "spacing.2",
        },
      },
    },
    {
      hasBrowserControls: true,
      willClear: true,
      css: {
        input: {
          // Hide the number scroll arrows in safari + firefox when not focused
          "&[type=number]::-webkit-outer-spin-button, &[type=number]::-webkit-inner-spin-button":
            {
              WebkitAppearance: "none",
            },
          "&[type=number]": {
            // @ts-expect-error moz-appearance is a valid firefox property
            "-moz-appearance": "textfield",
          },
        },
      },
    },
    {
      hasBrowserControls: true,
      hasIcons: true,
      css: {
        input: {
          paddingRight: "1",
        },
      },
    },
    {
      hasBrowserControls: true,
      editAndClear: true,
      css: {
        editIcon: {
          _before: {
            left: "0",
          },
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
