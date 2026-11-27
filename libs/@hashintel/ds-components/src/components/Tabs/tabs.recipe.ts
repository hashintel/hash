import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

/**
 * Folder panel-junction corners, parameterised by two variables on the ark
 * root — the shared scope of the wrapper's hairline and the sibling panel —
 * so every piece (hairline inset, arc, panel radius) agrees for ANY value and
 * the edges always connect. TabList scrubs them from the scroll position (a
 * corner straightens exactly as the selected flap reaches it); these static
 * rules are the SSR/no-JS fallback: square without a panel, round with one,
 * square where the selected tab rests on a corner.
 *
 * Hoisted consts (spread into the compound variants) because the
 * root:has(> &) selector keys are valid Panda nesting but fail
 * SystemStyleObject's excess property checks in compound-variant css. The
 * child anchoring scopes every rule to the owning root, so nested tabs don't
 * leak their variables and conditions onto an outer root.
 */
const folderCornerVarRules = {
  "[data-scope='tabs'][data-part='root']:has(> &)": {
    "--tabs-corner-start": "[0px]",
    "--tabs-corner-end": "[0px]",
  },
  "[data-scope='tabs'][data-part='root']:has(> &):has(> [data-scope='tabs'][data-part='content'])":
    {
      "--tabs-corner-start": "[var(--radii-lg)]",
      "--tabs-corner-end": "[var(--radii-lg)]",
    },
  "[data-scope='tabs'][data-part='root']:has(> & > [data-scope='tabs'][data-part='list'] > [data-part='trigger']:nth-child(2)[data-selected])":
    {
      "--tabs-corner-start": "[0px]",
    },
};

// Static fallback for the trailing corner: with fullWidth tabs a selected
// last flap rests against it
const folderCornerEndFlushRule = {
  "[data-scope='tabs'][data-part='root']:has(> & > [data-scope='tabs'][data-part='list'] > [data-part='trigger']:last-child[data-selected])":
    {
      "--tabs-corner-end": "[0px]",
    },
};

export const styles = sva({
  slots: ["wrapper", "list", "trigger", "indicator", "actions", "content"],
  base: {
    wrapper: {
      display: "flex",
    },
    list: {
      position: "relative",
      isolation: "isolate",
      display: "flex",
      flexGrow: "1",
      minWidth: "0",
      userSelect: "none",
    },
    trigger: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "1",
      flexShrink: "0",
      paddingX: "[var(--tabs-trigger-px)]",
      paddingY: "var(--form-padding-y)",
      minHeight:
        "[calc(round(var(--form-line-height) * var(--leading-factor, 1), 1px) + var(--form-padding-y) * 2)]",
      fontWeight: "medium",
      whiteSpace: "nowrap",
      textDecoration: "none",
      color: "fg.muted",
      cursor: "pointer",
      transition: "[color 0.15s ease, background-color 0.15s ease]",
      "&:hover:not([data-disabled]):not([data-selected])": {
        color: "fg.muted.hover",
      },
      "&[data-selected]": {
        color: "fg.heading",
      },
      "&[data-disabled]": {
        cursor: "unset",
        color: "fg.subtle.disabled",
      },
      "&[data-disabled][data-selected]": {
        color: "fg.body.disabled",
      },
      "&:focus-visible": {
        outline: "[2px solid {colors.black.a60}]",
        outlineOffset: "[-2px]",
      },
    },
    indicator: {
      "--transition-duration": "[180ms]",
      "--transition-timing-function": "[cubic-bezier(0.2, 0, 0, 1)]",
      // Positioned from zag's measured trigger rect (--left/--top/--width/
      // --height); the main-axis inset is mapped per orientation below.
      // zag also sets position and the main axis inline — these rules keep
      // the recipe correct on its own.
      position: "absolute",
      // border-box so the folder flap's border doesn't inflate the
      // trigger-sized width/height Ark provides (there is no preflight
      // border-box reset).
      boxSizing: "border-box",
      width: "var(--width)",
    },
    actions: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      flexShrink: "0",
    },
  },
  variants: {
    variant: {
      line: {
        trigger: {
          '&[data-align="top"]': { alignSelf: "flex-start" },
          '&[data-align="center"]': { alignSelf: "center" },
          '&[data-align="bottom"]': { alignSelf: "flex-end" },
        },
        indicator: {
          borderRadius: "full",
          backgroundColor: "neutral.s110",
        },
      },
      pill: {
        list: {
          gap: "1",
        },
        trigger: {
          borderRadius: "md",
          "&:hover:not([data-disabled]):not([data-selected])": {
            backgroundColor: "neutral.a15",
          },
          '&[data-align="top"]': { alignItems: "flex-start" },
          '&[data-align="bottom"]': { alignItems: "flex-end" },
        },
        indicator: {
          top: "var(--top)",
          left: "var(--left)",
          height: "var(--height)",
          borderRadius: "md",
          backgroundColor: "neutral.a30",
        },
      },
      folder: {
        list: {
          gap: "1",
        },
        trigger: {
          "&::before": {
            content: "''",
            position: "absolute",
            zIndex: "[-1]",
            transition: "[background-color 0.15s ease]",
          },
          "&:hover:not([data-disabled]):not([data-selected])::before": {
            backgroundColor: "neutral.a10",
          },
          '&[data-align="top"]': { alignSelf: "flex-start" },
          '&[data-align="center"]': { alignSelf: "center" },
          '&[data-align="bottom"]': { alignSelf: "flex-end" },
        },
        indicator: {
          backgroundColor: "neutral.s00",
          borderWidth: "[1px]",
          borderStyle: "solid",
          borderColor: "bd.subtle",
          "[data-stuck] &": {
            visibility: "hidden",
          },
        },
      },
    },
    align: {
      left: {
        list: { justifyContent: "flex-start" },
      },
      center: {},
      fullWidth: {
        trigger: { flexGrow: "1" },
      },
    },
    // The size vars are declared on the ark root (anchored from the wrapper
    // via :has) so that the sibling tab panels can read them too, not just
    // the wrapper's own subtree. --tabs-trigger-py mirrors the formSizes
    // --form-padding-y value, which lives on the trigger and is likewise out
    // of the panels' reach.
    size: {
      xs: {
        wrapper: {
          "[data-scope='tabs'][data-part='root']:has(> &)": {
            "--tabs-trigger-px": "spacing.2",
            "--tabs-trigger-py": "spacing.0",
            "--tabs-panel-p": "spacing.2",
            "--tabs-radius": "radii.md",
          },
        },
        trigger: formSizes.variants.sizes.xs,
      },
      sm: {
        wrapper: {
          "[data-scope='tabs'][data-part='root']:has(> &)": {
            "--tabs-trigger-px": "spacing.2",
            "--tabs-trigger-py": "spacing.0.5",
            "--tabs-panel-p": "spacing.2.5",
            "--tabs-radius": "radii.lg",
          },
        },
        trigger: formSizes.variants.sizes.sm,
      },
      md: {
        wrapper: {
          "[data-scope='tabs'][data-part='root']:has(> &)": {
            "--tabs-trigger-px": "spacing.3",
            "--tabs-trigger-py": "spacing.1",
            "--tabs-panel-p": "spacing.3",
            "--tabs-radius": "radii.lg",
          },
        },
        trigger: formSizes.variants.sizes.md,
      },
      lg: {
        wrapper: {
          "[data-scope='tabs'][data-part='root']:has(> &)": {
            "--tabs-trigger-px": "spacing.4",
            "--tabs-trigger-py": "spacing.2",
            "--tabs-panel-p": "spacing.4",
            "--tabs-radius": "radii.lg",
          },
        },
        trigger: formSizes.variants.sizes.lg,
      },
    },
    orientation: {
      horizontal: {
        indicator: {
          left: "var(--left)",
        },
        list: {
          overflowX: "auto",
          overflowY: "hidden",
          overscrollBehaviorX: "contain",
          scrollbar: "hidden",
          maskImage:
            "[linear-gradient(to right, transparent 0, black var(--tabs-fade-start, 0px), black calc(100% - var(--tabs-fade-end, 0px)), transparent 100%)]",
        },
        actions: {
          marginLeft: "[auto]",
          paddingLeft: "2",
          alignItems: "flex-end",
          paddingBottom: "[var(--tabs-trigger-py)]",
        },
        content: {
          paddingY: "[var(--tabs-panel-p)]",
        },
      },
      vertical: {
        indicator: {
          top: "var(--top)",
        },
        wrapper: {
          flexDirection: "column",
          width: "[fit-content]",
          // Lays the ark root out as a row so panels sit beside the vertical
          // list and stretch to its height, keeping the folder panel borders
          // meeting the hairline
          "[data-scope='tabs'][data-part='root']:has(> &)": {
            display: "flex",
          },
        },
        list: {
          flexDirection: "column",
          minHeight: "0",
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehaviorY: "contain",
          scrollbar: "hidden",
          maskImage:
            "[linear-gradient(to bottom, transparent 0, black var(--tabs-fade-start, 0px), black calc(100% - var(--tabs-fade-end, 0px)), transparent 100%)]",
        },
        trigger: {
          justifyContent: "flex-start",
        },
        actions: {
          flexDirection: "column",
          alignItems: "flex-start",
          marginTop: "[auto]",
          paddingTop: "2",
          paddingX: "[var(--tabs-trigger-px)]",
        },
        content: {
          paddingX: "[calc(var(--tabs-panel-p) + 8px)]",
        },
      },
    },
  },
  compoundVariants: [
    {
      align: "center",
      orientation: "horizontal",
      css: {
        trigger: {
          "&:nth-child(2)": { marginLeft: "[auto]" },
          "&:last-child": { marginRight: "[auto]" },
        },
      },
    },
    {
      align: "center",
      orientation: "vertical",
      css: {
        trigger: {
          "&:nth-child(2)": { marginTop: "[auto]" },
          "&:last-child": { marginBottom: "[auto]" },
        },
      },
    },
    {
      // With fullWidth tabs the last flap reaches the container edge, so when
      // it is selected the adjoining panel corner stays square too
      variant: "folder",
      align: "fullWidth",
      orientation: "horizontal",
      css: {
        wrapper: { ...folderCornerEndFlushRule },
      },
    },
    {
      variant: "folder",
      align: "fullWidth",
      orientation: "vertical",
      css: {
        wrapper: { ...folderCornerEndFlushRule },
      },
    },
    {
      // In a vertical list the pill spans the full width and the label's free
      // axis is horizontal, so `align` maps to justify instead
      variant: "pill",
      orientation: "vertical",
      css: {
        trigger: {
          '&[data-align="top"]': {
            alignItems: "center",
            justifyContent: "flex-start",
          },
          '&[data-align="center"]': {
            alignItems: "center",
            justifyContent: "center",
          },
          '&[data-align="bottom"]': {
            alignItems: "center",
            justifyContent: "flex-end",
          },
        },
      },
    },
    {
      variant: "line",
      orientation: "horizontal",
      css: {
        wrapper: { boxShadow: "[inset 0 -1px 0 {colors.bd.subtle}]" },
        indicator: { bottom: "0", height: "[2px]" },
      },
    },
    {
      variant: "line",
      orientation: "vertical",
      css: {
        wrapper: { boxShadow: "[inset -1px 0 0 {colors.bd.subtle}]" },
        indicator: { right: "0", width: "[2px]", height: "var(--height)" },
      },
    },
    {
      variant: "folder",
      orientation: "horizontal",
      css: {
        wrapper: {
          position: "relative",
          ...folderCornerVarRules,
          // The hairline is a pseudo rather than an inset shadow so it can
          // stop short of the panel's rounded top corners; the panel's arc
          // pseudos bridge it into the side borders. It paints before the
          // list, so the flap still covers it.
          "&::before": {
            content: "''",
            position: "absolute",
            left: "[var(--tabs-corner-start)]",
            right: "[var(--tabs-corner-end)]",
            bottom: "0",
            height: "[1px]",
            backgroundColor: "bd.subtle",
          },
          // Closes the border around sibling tab panels; the hairline above
          // is their top edge, so the panel only adds the remaining sides.
          // Horizontal padding lines the panel text up with the first tab's
          // label: trigger inset minus the panel's own 1px side border.
          // The rounded top corners are quarter-arc pseudos, one radius plus
          // a pixel in size so their straight end meets the inset hairline;
          // z -1 keeps them under the panel's content (hence the isolation).
          "& ~ [data-scope='tabs'][data-part='content']": {
            position: "relative",
            isolation: "isolate",
            borderWidth: "[1px]",
            borderTopWidth: "[0px]",
            borderStyle: "solid",
            borderColor: "bd.subtle",
            borderRadius: "lg",
            borderTopLeftRadius: "[var(--tabs-corner-start)]",
            borderTopRightRadius: "[var(--tabs-corner-end)]",
            paddingX: "[calc(var(--tabs-trigger-px) - 1px)]",
            "&::before": {
              content: "''",
              position: "absolute",
              zIndex: "[-1]",
              top: "[-1px]",
              left: "[-1px]",
              width: "[calc(var(--tabs-corner-start) + 1px)]",
              height: "[calc(var(--tabs-corner-start) + 1px)]",
              backgroundColor: "neutral.s00",
              borderWidth: "[0px]",
              borderTopWidth: "[1px]",
              borderLeftWidth: "[1px]",
              borderStyle: "solid",
              borderColor: "bd.subtle",
              borderTopLeftRadius: "[var(--tabs-corner-start)]",
            },
            "&::after": {
              content: "''",
              position: "absolute",
              zIndex: "[-1]",
              top: "[-1px]",
              right: "[-1px]",
              width: "[calc(var(--tabs-corner-end) + 1px)]",
              height: "[calc(var(--tabs-corner-end) + 1px)]",
              backgroundColor: "neutral.s00",
              borderWidth: "[0px]",
              borderTopWidth: "[1px]",
              borderRightWidth: "[1px]",
              borderStyle: "solid",
              borderColor: "bd.subtle",
              borderTopRightRadius: "[var(--tabs-corner-end)]",
            },
          },
        },
        trigger: {
          borderTopRadius: "[var(--tabs-radius)]",
          "&::before": {
            top: "0",
            left: "0",
            right: "0",
            height: "[999px]",
            borderTopRadius: "[var(--tabs-radius)]",
          },
          "&[data-selected]": {
            position: "sticky",
            left: "0",
            right: "0",
            zIndex: "[1]",
            backgroundColor: "neutral.s00",
            boxShadow:
              "[inset 1px 0 0 {colors.bd.subtle}, inset -1px 0 0 {colors.bd.subtle}, inset 0 1px 0 {colors.bd.subtle}]",
            transition:
              "[color 0.15s ease, background-color 0s 180ms, box-shadow 0s 180ms]",
          },
        },
        indicator: {
          top: "var(--top)",
          bottom: "0",
          borderBottomColor: "[transparent]",
          borderTopRadius: "[var(--tabs-radius)]",
        },
      },
    },
    {
      variant: "folder",
      orientation: "vertical",
      css: {
        wrapper: {
          position: "relative",
          // Mirror of horizontal: scrubbed corner variables on the root and a
          // pseudo hairline on the right edge that stops short of the panel's
          // rounded left corners
          ...folderCornerVarRules,
          "&::before": {
            content: "''",
            position: "absolute",
            top: "[var(--tabs-corner-start)]",
            bottom: "[var(--tabs-corner-end)]",
            right: "0",
            width: "[1px]",
            backgroundColor: "bd.subtle",
          },
          // As in horizontal, but the hairline is the panels' left edge, the
          // text lines up vertically with the first tab's label, and the
          // corner arcs join the vertical hairline to the panel's top and
          // bottom borders
          "& ~ [data-scope='tabs'][data-part='content']": {
            position: "relative",
            isolation: "isolate",
            borderWidth: "[1px]",
            borderLeftWidth: "[0px]",
            borderStyle: "solid",
            borderColor: "bd.subtle",
            borderRadius: "lg",
            borderTopLeftRadius: "[var(--tabs-corner-start)]",
            borderBottomLeftRadius: "[var(--tabs-corner-end)]",
            paddingY: "[calc(var(--tabs-trigger-py) - 1px)]",
            "&::before": {
              content: "''",
              position: "absolute",
              zIndex: "[-1]",
              top: "[-1px]",
              left: "[-1px]",
              width: "[calc(var(--tabs-corner-start) + 1px)]",
              height: "[calc(var(--tabs-corner-start) + 1px)]",
              backgroundColor: "neutral.s00",
              borderWidth: "[0px]",
              borderTopWidth: "[1px]",
              borderLeftWidth: "[1px]",
              borderStyle: "solid",
              borderColor: "bd.subtle",
              borderTopLeftRadius: "[var(--tabs-corner-start)]",
            },
            "&::after": {
              content: "''",
              position: "absolute",
              zIndex: "[-1]",
              bottom: "[-1px]",
              left: "[-1px]",
              width: "[calc(var(--tabs-corner-end) + 1px)]",
              height: "[calc(var(--tabs-corner-end) + 1px)]",
              backgroundColor: "neutral.s00",
              borderWidth: "[0px]",
              borderBottomWidth: "[1px]",
              borderLeftWidth: "[1px]",
              borderStyle: "solid",
              borderColor: "bd.subtle",
              borderBottomLeftRadius: "[var(--tabs-corner-end)]",
            },
          },
        },
        trigger: {
          borderLeftRadius: "[var(--tabs-radius)]",
          "&::before": {
            top: "0",
            bottom: "0",
            left: "0",
            width: "[999px]",
            borderLeftRadius: "[var(--tabs-radius)]",
          },
          "&[data-selected]": {
            position: "sticky",
            top: "0",
            bottom: "0",
            zIndex: "[1]",
            backgroundColor: "neutral.s00",
            boxShadow:
              "[inset 0 1px 0 {colors.bd.subtle}, inset 0 -1px 0 {colors.bd.subtle}, inset 1px 0 0 {colors.bd.subtle}]",
            transition:
              "[color 0.15s ease, background-color 0s 180ms, box-shadow 0s 180ms]",
          },
        },
        indicator: {
          left: "var(--left)",
          right: "0",
          width: "[auto]",
          height: "var(--height)",
          borderRightColor: "[transparent]",
          borderLeftRadius: "[var(--tabs-radius)]",
        },
      },
    },
  ],
  defaultVariants: {
    variant: "line",
    align: "left",
    size: "md",
    orientation: "horizontal",
  },
});
