import { sva } from "@hashintel/ds-helpers/css";

export const propsTableRecipe = sva({
  slots: [
    "table",
    "headerCell",
    "propCell",
    "typeCell",
    "descriptionCell",
    "defaultNote",
    "requiredChip",
  ],
  base: {
    table: {
      width: "full",
      margin: "0",
      marginBottom: "4",
      borderCollapse: "collapse",
      fontSize: "sm",
      lineHeight: "normal",
    },
    headerCell: {
      paddingBlock: "2",
      paddingRight: "3",
      paddingLeft: "0",
      borderBottom: "1px solid {colors.bd.subtle}",
      verticalAlign: "top",
      textAlign: "left",
      fontSize: "xs",
      fontWeight: "semibold",
      color: "fg.muted",
    },
    propCell: {
      paddingBlock: "2",
      paddingRight: "3",
      paddingLeft: "0",
      borderBottom: "1px solid {colors.bd.subtle}",
      verticalAlign: "top",
      textAlign: "left",
      fontFamily: "mono",
      fontSize: "xs",
      lineHeight: "[18px]",
      whiteSpace: "nowrap",
    },
    typeCell: {
      paddingBlock: "2",
      paddingRight: "3",
      paddingLeft: "0",
      borderBottom: "1px solid {colors.bd.subtle}",
      verticalAlign: "top",
      textAlign: "left",
      fontFamily: "mono",
      fontSize: "xs",
      lineHeight: "[18px]",
      color: "fg.muted",
      maxWidth: "[280px]",
    },
    descriptionCell: {
      paddingBlock: "2",
      paddingRight: "3",
      paddingLeft: "0",
      borderBottom: "1px solid {colors.bd.subtle}",
      verticalAlign: "top",
      textAlign: "left",
      color: "fg.body",
      // Flatten react-markdown's block output to read as table-cell prose.
      "& p": {
        margin: "0",
      },
      "& p + p, & ul, & ol": {
        marginTop: "1.5",
      },
      "& ul, & ol": {
        marginBottom: "0",
        paddingInlineStart: "4",
      },
      "& a": {
        color: "fg.link",
        textDecoration: "underline",
        textUnderlineOffset: "[2px]",
      },
    },
    defaultNote: {
      marginTop: "1.5",
      color: "fg.body",
    },
    // Visuals come from the Chip the cell renders; this only spaces it.
    requiredChip: {
      marginTop: "1",
    },
  },
});
