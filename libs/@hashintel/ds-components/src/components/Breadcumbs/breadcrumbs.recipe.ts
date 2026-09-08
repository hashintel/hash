import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "root",
    "list",
    "item",
    "link",
    "label",
    "custom",
    "icon",
    "dropdownIcon",
    "separator",
    "ellipsisTrigger",
    "tooltipWrapper",
    "measure",
  ],
  base: {
    root: {
      display: "flex",
      alignItems: "center",
      position: "relative",
      "--breadcrumbs-gutter": "10px",
      width: "[calc(100% + 2 * var(--breadcrumbs-gutter))]",
      minWidth: "0",
      maxWidth: "[calc(100% + 2 * var(--breadcrumbs-gutter))]",
      padding: "[var(--breadcrumbs-gutter)]",
      margin: "[calc(-1 * var(--breadcrumbs-gutter))]",
      overflow: "hidden",
    },
    list: {
      display: "flex",
      alignItems: "center",
      minWidth: "0",
      maxWidth: "full",
      listStyle: "none",
    },
    item: {
      display: "inline-flex",
      alignItems: "center",
      minWidth: "0",
      flexShrink: "0",
      color: "neutral.s105",
      fontWeight: "[450]",
      "&[data-current]": {
        // Only the current page truncates; ancestors stay whole.
        minWidth: "0",
        flexShrink: "1",
      },
    },
    link: {
      display: "inline-flex",
      alignItems: "center",
      minWidth: "0",
      font: "[inherit]",
      // Pin a real line-height: `font: inherit` would otherwise pull it from an
      // ancestor, and the Tooltip trigger wrapper sets `line-height: 0`, which
      // would collapse the label (overflow: hidden) to zero height.
      lineHeight: "[1.2]",
      // The hover-fill pill is the element's own padded box (padding is set
      // per size variant, cancelled in layout by equal negative margins), so
      // popovers anchored to the crumb align with the pill automatically.
      boxSizing: "border-box",
      borderRadius: "md",
      transition: "colors",
      "&:is(a, button):not([aria-disabled=true])": {
        cursor: "pointer",
      },
      "&:is(a, button):not([aria-disabled=true]):hover": {
        color: "neutral.s110",
        background: "neutral.a30",
      },
      // A menu crumb stays highlighted while its dropdown is open.
      "&[aria-expanded=true]": {
        color: "neutral.s110",
        background: "neutral.a30",
      },
      "&:focus-visible": {
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: "black.a60",
        outlineOffset: "[-2px]",
      },
    },
    label: {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    custom: {
      display: "inline-flex",
      alignItems: "center",
      minWidth: "0",
    },
    icon: {
      color: "neutral.s85",
    },
    // The chevron-down marking a crumb that opens a dropdown menu.
    dropdownIcon: {
      color: "neutral.s85",
    },
    separator: {
      boxSizing: "content-box",
      flexShrink: "0",
      color: "neutral.s85",
      userSelect: "none",
    },
    ellipsisTrigger: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      color: "neutral.s100",
      cursor: "pointer",
      background: "[none]",
      border: "0",
      // The icon-sized trigger is far below the 24px minimum target size
      // (WCAG 2.5.8); the per-size padding extends the hit area, forms the
      // button-shaped hover fill / focus-ring shape matching the item pills,
      // and anchors the ellipsis menu. Equal negative margins cancel it in
      // layout, so the trail (and the width measurement) stays icon-sized —
      // `measure()` compensates where it measures this box directly.
      boxSizing: "border-box",
      borderRadius: "md",
      transition: "colors",
      "&:hover": {
        color: "neutral.s110",
        background: "neutral.a30",
      },
      "&[aria-expanded=true]": {
        color: "neutral.s110",
        background: "neutral.a30",
      },
      "&:focus-visible": {
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: "black.a60",
        outlineOffset: "[-2px]",
      },
    },
    // The Tooltip trigger span around a crumb. As a flex item it would default
    // to `min-width: auto`, which blocks the crumb inside from shrinking and
    // so from truncating — pin it shrinkable.
    tooltipWrapper: {
      display: "inline-flex",
      minWidth: "0",
      maxWidth: "full",
    },
    // The hidden layer that renders every item at natural width so the
    // component can measure how much room the full trail needs.
    // `max-content` opts out of absolute-position shrink-to-fit, which would
    // otherwise clamp the row to the nav and shrink the cells being measured.
    measure: {
      display: "flex",
      alignItems: "center",
      position: "absolute",
      top: "0",
      left: "0",
      width: "[max-content]",
      visibility: "hidden",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    size: {
      xxs: {
        list: { textStyle: "xxs" },
        link: {
          gap: "[3px]",
          paddingBlock: "[2.5px]",
          paddingInline: "[3.5px]",
          marginBlock: "[-2.5px]",
          marginInline: "[-3.5px]",
        },
        icon: { "&&": { "--icon-size": "8px" } },
        dropdownIcon: {
          marginInlineStart: "[1px]",
          "&&": { "--icon-size": "8px" },
        },
        separator: { paddingInline: "[5px]", "&&": { "--icon-size": "8px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "10px" },
          padding: "[4.5px]",
          margin: "[-4.5px]",
        },
      },
      xs: {
        list: { textStyle: "xs" },
        link: {
          gap: "[4px]",
          paddingBlock: "[2.5px]",
          paddingInline: "[4.5px]",
          marginBlock: "[-2.5px]",
          marginInline: "[-4.5px]",
        },
        icon: { "&&": { "--icon-size": "9px" } },
        dropdownIcon: {
          marginInlineStart: "[1px]",
          "&&": { "--icon-size": "9px" },
        },
        separator: { paddingInline: "[6px]", "&&": { "--icon-size": "9px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "12px" },
          padding: "[5.5px]",
          margin: "[-5.5px]",
        },
      },
      sm: {
        list: { textStyle: "sm" },
        link: {
          gap: "[4px]",
          paddingBlock: "[3.5px]",
          paddingInline: "[5px]",
          marginBlock: "[-3.5px]",
          marginInline: "[-5px]",
        },
        icon: { "&&": { "--icon-size": "12px" } },
        dropdownIcon: {
          marginInlineStart: "[2px]",
          "&&": { "--icon-size": "11px" },
        },
        separator: { paddingInline: "2", "&&": { "--icon-size": "12px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "14px" },
          padding: "[6px]",
          margin: "[-6px]",
        },
      },
      md: {
        list: { textStyle: "base" },
        link: {
          gap: "[5px]",
          paddingBlock: "[3.5px]",
          paddingInline: "[6px]",
          marginBlock: "[-3.5px]",
          marginInline: "[-6px]",
        },
        icon: { "&&": { "--icon-size": "14px" } },
        dropdownIcon: {
          marginInlineStart: "[2px]",
          "&&": { "--icon-size": "12px" },
        },
        separator: { paddingInline: "[9px]", "&&": { "--icon-size": "14px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "16px" },
          padding: "[7px]",
          margin: "[-7px]",
        },
      },
      lg: {
        list: { textStyle: "lg" },
        link: {
          gap: "[6px]",
          paddingBlock: "[4px]",
          paddingInline: "[6px]",
          marginBlock: "[-4px]",
          marginInline: "[-6px]",
        },
        icon: { "&&": { "--icon-size": "16px" } },
        dropdownIcon: { "&&": { "--icon-size": "17px" } },
        separator: { paddingInline: "[9px]", "&&": { "--icon-size": "20px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "20px" },
          padding: "[6.5px]",
          margin: "[-6.5px]",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
