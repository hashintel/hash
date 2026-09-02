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
      maxWidth: "full",
      position: "relative",
      isolation: "isolate",
      font: "[inherit]",
      // Pin a real line-height: `font: inherit` would otherwise pull it from an
      // ancestor, and the Tooltip trigger wrapper sets `line-height: 0`, which
      // would collapse the label (overflow: hidden) to zero height.
      lineHeight: "[1.2]",
      transition: "colors",
      // The hover-fill pill; its insets are set per size variant.
      _before: {
        content: '""',
        position: "absolute",
        zIndex: "[-1]",
        borderRadius: "md",
        transition: "[background-color 0.15s ease]",
      },
      "&:is(a, button):not([aria-disabled=true])": {
        cursor: "pointer",
      },
      "&:is(a, button):not([aria-disabled=true]):hover": {
        color: "neutral.s110",
      },
      "&:is(a, button):not([aria-disabled=true]):hover::before": {
        background: "neutral.a30",
      },
      // A menu crumb stays highlighted while its dropdown is open.
      "&[aria-expanded=true]": {
        color: "neutral.s110",
      },
      "&[aria-expanded=true]::before": {
        background: "neutral.a30",
      },
      "&:focus-visible": {
        outlineStyle: "none",
      },
      "&:focus-visible::before": {
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
      position: "relative",
      isolation: "isolate",
      color: "neutral.s100",
      cursor: "pointer",
      background: "[none]",
      border: "0",
      padding: "0",
      transition: "colors",
      // The icon-sized trigger is far below the 24px minimum target size
      // (WCAG 2.5.8); extend the hit area without affecting layout — and
      // therefore without affecting the width measurement. The same pseudo
      // doubles as the crumbs' button-shaped hover fill and focus-ring shape;
      // its inset is set per size variant to match the item pills' height.
      _before: {
        content: '""',
        position: "absolute",
        zIndex: "[-1]",
        borderRadius: "md",
        // Background only — see the crumb link's ::before.
        transition: "[background-color 0.15s ease]",
      },
      "&:hover": {
        color: "neutral.s110",
      },
      "&:hover::before": {
        background: "neutral.a30",
      },
      "&[aria-expanded=true]": {
        color: "neutral.s110",
      },
      "&[aria-expanded=true]::before": {
        background: "neutral.a30",
      },
      // `outlineStyle`, not `outline: none` — see the crumb link.
      "&:focus-visible": {
        outlineStyle: "none",
      },
      "&:focus-visible::before": {
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
          _before: { insetBlock: "[-2.5px]", insetInline: "[-3.5px]" },
        },
        icon: { "&&": { "--icon-size": "8px" } },
        dropdownIcon: {
          marginInlineStart: "[1px]",
          "&&": { "--icon-size": "8px" },
        },
        separator: { paddingInline: "[5px]", "&&": { "--icon-size": "8px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "10px" },
          _before: { inset: "[-4.5px]" },
        },
      },
      xs: {
        list: { textStyle: "xs" },
        link: {
          gap: "[4px]",
          _before: { insetBlock: "[-2.5px]", insetInline: "[-4.5px]" },
        },
        icon: { "&&": { "--icon-size": "9px" } },
        dropdownIcon: {
          marginInlineStart: "[1px]",
          "&&": { "--icon-size": "9px" },
        },
        separator: { paddingInline: "[6px]", "&&": { "--icon-size": "9px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "12px" },
          _before: { inset: "[-5.5px]" },
        },
      },
      sm: {
        list: { textStyle: "sm" },
        link: {
          gap: "[4px]",
          _before: { insetBlock: "[-3.5px]", insetInline: "[-5px]" },
        },
        icon: { "&&": { "--icon-size": "12px" } },
        dropdownIcon: {
          marginInlineStart: "[2px]",
          "&&": { "--icon-size": "11px" },
        },
        separator: { paddingInline: "2", "&&": { "--icon-size": "12px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "14px" },
          _before: { inset: "[-6px]" },
        },
      },
      md: {
        list: { textStyle: "base" },
        link: {
          gap: "[5px]",
          _before: { insetBlock: "[-3.5px]", insetInline: "[-6px]" },
        },
        icon: { "&&": { "--icon-size": "14px" } },
        dropdownIcon: {
          marginInlineStart: "[2px]",
          "&&": { "--icon-size": "12px" },
        },
        separator: { paddingInline: "[9px]", "&&": { "--icon-size": "14px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "16px" },
          _before: { inset: "[-7px]" },
        },
      },
      lg: {
        list: { textStyle: "lg" },
        link: {
          gap: "[6px]",
          _before: { insetBlock: "[-4px]", insetInline: "[-6px]" },
        },
        icon: { "&&": { "--icon-size": "16px" } },
        dropdownIcon: { "&&": { "--icon-size": "17px" } },
        separator: { paddingInline: "[9px]", "&&": { "--icon-size": "20px" } },
        ellipsisTrigger: {
          "& svg": { "--icon-size": "20px" },
          _before: { inset: "[-6.5px]" },
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});
