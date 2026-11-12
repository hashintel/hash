import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "item", "handle", "content"],
  base: {
    root: {
      display: "flex",
      flexDirection: "column",
      listStyleType: "none",
      margin: "0",
      padding: "0",
    },
    item: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      "&[data-dragging]": {
        zIndex: "[1]",
      },
    },
    handle: {
      appearance: "none",
      margin: "0",
      border: "[none]",
      background: "[transparent]",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
      flexShrink: "0",
      paddingX: "0.5",
      paddingY: "0",
      borderRadius: "sm",
      color: "fg.subtle",
      cursor: "grab",
      // The pointer sensor needs the browser's touch gestures off the activator.
      touchAction: "none",
      transition: "[color 0.15s ease]",
      "&:hover:not([data-disabled])": {
        color: "fg.muted.hover",
      },
      "&:focus-visible": {
        outline: "[2px solid {colors.black.a40}]",
        outlineOffset: "0",
      },
      "&[data-dragging]": {
        cursor: "grabbing",
      },
      "&[data-disabled]": {
        color: "fg.subtle.disabled",
        cursor: "auto",
      },
    },
    content: {
      display: "flex",
      alignItems: "center",
      flexGrow: "1",
      minWidth: "0",
    },
  },
  variants: {
    handleAlign: {
      center: {},
      start: {
        handle: {
          alignItems: "flex-start",
          // Centres the grip against a standard small-control first row,
          // for items whose content stacks extra rows beneath it
          paddingTop: "2.5",
        },
      },
    },
    variant: {
      card: {
        root: {
          gap: "2",
        },
        item: {
          gap: "1.5",
          paddingY: "1",
          paddingLeft: "1.5",
          paddingRight: "2.5",
          borderWidth: "[1px]",
          borderStyle: "solid",
          borderColor: "bd.subtle",
          borderRadius: "xl",
          backgroundColor: "white",
          "&[data-dragging]": {
            boxShadow: "elevation.raise.macro",
          },
        },
        content: {
          gap: "1.5",
        },
      },
      plain: {
        root: {
          gap: "1",
        },
        item: {
          gap: "1",
        },
        content: {
          gap: "1",
        },
      },
    },
  },
  defaultVariants: {
    variant: "card",
    handleAlign: "center",
  },
});
