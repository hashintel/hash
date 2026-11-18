import { css } from "@hashintel/ds-helpers/css";

export const markdownStyle = css({
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  "& > :first-child": {
    marginTop: "[0]",
  },
  "& > :last-child": {
    marginBottom: "[0]",
  },
  "& p": {
    marginY: "2",
  },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    marginTop: "3",
    marginBottom: "1",
    fontWeight: "semibold",
    lineHeight: "[1.25]",
    color: "neutral.s110",
  },
  "& h1": {
    fontSize: "[15px]",
  },
  "& h2, & h3": {
    fontSize: "sm",
  },
  "& h4, & h5, & h6": {
    fontSize: "xs",
  },
  "& ul, & ol": {
    marginY: "2",
    paddingLeft: "5",
  },
  "& ul": {
    listStyleType: "disc",
  },
  "& ol": {
    listStyleType: "decimal",
  },
  "& li": {
    marginY: "1",
  },
  "& li > p": {
    marginY: "1",
  },
  "& a": {
    color: "blue.s90",
    textDecorationLine: "underline",
    textUnderlineOffset: "[2px]",
  },
  "& blockquote": {
    marginY: "2",
    marginX: "[0]",
    borderLeftWidth: "[3px]",
    borderLeftStyle: "solid",
    borderLeftColor: "neutral.a40",
    paddingLeft: "3",
    color: "neutral.s90",
  },
  "& pre": {
    marginY: "2",
    overflowX: "auto",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.a30",
    borderRadius: "md",
    backgroundColor: "neutral.s20",
    padding: "2",
  },
  "& :not(pre) > code": {
    fontFamily: "mono",
    fontSize: "xs",
    backgroundColor: "neutral.s20",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.a30",
    borderRadius: "sm",
    paddingX: "1",
    paddingY: "[2px]",
  },
  "& pre code": {
    display: "block",
    minWidth: "[max-content]",
    backgroundColor: "[transparent]",
    padding: "[0]",
    fontFamily: "mono",
    fontSize: "xs",
    lineHeight: "[1.5]",
  },
  "& hr": {
    marginY: "3",
    borderWidth: "[0]",
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.a30",
  },
});
