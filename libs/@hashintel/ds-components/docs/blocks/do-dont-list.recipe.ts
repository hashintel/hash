import { sva } from "@hashintel/ds-helpers/css";

export const doDontListRecipe = sva({
  slots: ["list", "item", "mark", "label", "content"],
  base: {
    list: {
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: "2",
      margin: "0",
      marginBottom: "4",
      padding: "0",
    },
    item: {
      display: "flex",
      gap: "2.5",
      alignItems: "flex-start",
      fontSize: "sm",
      lineHeight: "normal",
      color: "fg.subtle",
    },
    mark: {
      flexShrink: "0",
      marginTop: "[2.5px]",
    },
    label: {
      srOnly: true,
    },
    content: {
      flex: "1",
      minWidth: "0",
    },
  },
  variants: {
    tone: {
      do: {
        mark: { color: "green.s80" },
      },
      dont: {
        mark: { color: "red.s80" },
      },
    },
  },
});
