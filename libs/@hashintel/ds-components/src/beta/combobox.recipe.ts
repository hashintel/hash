import { comboboxAnatomy } from "@ark-ui/react/anatomy";

import { type RecipeVariantProps, sva } from "@hashintel/ds-helpers/css";

import { inputRecipeConfig } from "./input.recipe";

const comboboxSlotRecipeDefinition = {
  className: "combobox",
  slots: comboboxAnatomy.extendWith("indicatorGroup").keys(),
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      gap: "1.5",
      width: "full",
    },
    label: {
      textStyle: "label",
    },
    input: {
      ...inputRecipeConfig.base,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    control: {
      position: "relative",
    },
    content: {
      background: "gray.surface.bg",
      borderRadius: "l2",
      boxShadow: "md",
      display: "flex",
      flexDirection: "column",
      maxH: "min(var(--available-height), {sizes.96})",
      minWidth: "max(var(--reference-width), {sizes.40})",
      outline: "0",
      overflowY: "auto",
      zIndex: "dropdown",
      _open: {
        animationStyle: "slide-fade-in",
        animationDuration: "slow",
      },
      _closed: {
        animationStyle: "slide-fade-out",
        animationDuration: "fastest",
      },
      "&[data-empty]:not(:has([data-scope=combobox][data-part=empty]))": {
        opacity: 0,
      },
    },
    item: {
      alignItems: "center",
      borderRadius: "l1",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      _hover: {
        background: "gray.surface.bg.hover",
      },
      _highlighted: {
        background: "gray.surface.bg.hover",
      },
      _selected: {},
      _disabled: {
        layerStyle: "disabled",
      },
    },
    itemGroup: {
      display: "flex",
      flexDirection: "column",
    },
    itemGroupLabel: {
      alignItems: "flex-start",
      color: "fg.subtle",
      display: "flex",
      flexDirection: "column",
      fontWeight: "medium",
      gap: "1px",
      justifyContent: "center",
      _after: {
        content: '""',
        width: "100%",
        height: "1px",
        bg: "border",
      },
    },
    itemIndicator: {
      color: "colorPalette.plain.fg",
    },
    indicatorGroup: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "1",
      pos: "absolute",
      insetEnd: "0",
      top: "0",
      bottom: "0",
    },
    trigger: {
      color: "fg.subtle",
    },
    clearTrigger: {
      color: "fg.muted",
    },
    empty: {
      display: "flex",
      alignItems: "center",
      color: "fg.subtle",
    },
  },
  defaultVariants: {
    size: "md",
    variant: "outline",
  },
  variants: {
    variant: {
      outline: {
        input: inputRecipeConfig.variants.variant.outline,
      },
      surface: {
        input: inputRecipeConfig.variants.variant.surface,
      },
      subtle: {
        input: inputRecipeConfig.variants.variant.subtle,
      },
    },
    size: {
      xs: {
        input: {
          ...inputRecipeConfig.variants.size.xs,
          pe: "12",
        },
        content: { p: "1", gap: "0.5", textStyle: "sm" },
        item: { px: "1", minH: "8", gap: "2", _icon: { boxSize: "3.5" } },
        itemGroup: { gap: "0.5" },
        itemGroupLabel: { px: "1", height: "8" },
        indicatorGroup: { px: "2", _icon: { boxSize: "3.5" } },
        empty: { px: "1", minH: "8" },
      },
      sm: {
        input: {
          ...inputRecipeConfig.variants.size.sm,
          pe: "14",
        },
        content: { p: "1", gap: "0.5", textStyle: "sm" },
        item: { px: "1.5", minH: "9", gap: "2", _icon: { boxSize: "4" } },
        itemGroup: { gap: "0.5" },
        itemGroupLabel: { px: "1.5", height: "9" },
        indicatorGroup: { px: "2.5", _icon: { boxSize: "4" } },
        empty: { px: "1.5", minH: "9" },
      },
      md: {
        input: {
          ...inputRecipeConfig.variants.size.md,
          pe: "14",
        },
        content: { p: "1", gap: "0.5", textStyle: "md" },
        indicatorGroup: { px: "3", _icon: { boxSize: "4" } },
        item: { px: "2", minH: "10", gap: "2", _icon: { boxSize: "4" } },
        itemGroup: { gap: "0.5" },
        itemGroupLabel: { px: "2", height: "10" },
        empty: { px: "2", minH: "10" },
      },
      lg: {
        input: {
          ...inputRecipeConfig.variants.size.lg,
          pe: "16",
        },
        content: { p: "1", gap: "0.5", textStyle: "md" },
        item: { px: "2.5", minH: "11", gap: "2", _icon: { boxSize: "4.5" } },
        itemGroup: { gap: "0.5" },
        itemGroupLabel: { px: "2.5", height: "11" },
        indicatorGroup: { px: "3.5", _icon: { boxSize: "4.5" } },
        empty: { px: "2.5", minH: "11" },
      },
      xl: {
        input: {
          ...inputRecipeConfig.variants.size.xl,
          pe: "16",
        },
        content: { p: "1", gap: "1", textStyle: "lg" },
        item: { px: "3", minH: "12", gap: "3", _icon: { boxSize: "5" } },
        itemGroup: { gap: "1" },
        itemGroupLabel: { px: "3", height: "12" },
        indicatorGroup: { px: "4", _icon: { boxSize: "5" } },
        empty: { px: "3", minH: "12" },
      },
    },
  },
} as const;

// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components
export const comboboxSlotRecipe = sva(comboboxSlotRecipeDefinition);

export type ComboboxSlotRecipeProps = RecipeVariantProps<typeof comboboxSlotRecipe>;
