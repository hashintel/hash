import type {
  HTMLAttributes,
  HTMLProps,
  isValidElement,
  ReactNode,
} from "react";
import type {
  Box,
  List,
  listClasses,
  ListItem as MuiListItem,
  listItemClasses,
  SxProps,
  Theme,
  Typography,
  typographyClasses,
} from "@mui/material";

import { Snippet } from "./elements/snippet";

const ParagraphSxProps: SxProps<Theme> = {
  color: (theme) => theme.palette.gray[40],
  letterSpacing: -0.17,
  fontSize: 17,
  lineHeight: 1.5,
};

export const BlockQuote = (props: Omit<HTMLProps<HTMLQuoteElement>, "ref">) => {
  return (
    <Box
      component={"blockquote"}
      sx={({ palette }) => ({
        borderLeftWidth: 4,
        borderLeftStyle: "solid",
        borderLeftColor: palette.gray[30],
        pl: 2,
        py: 0.5,
        "& blockquote": {
          my: 1,
        },
        [`& .${typographyClasses.root}, a, .${listClasses.root} .${listItemClasses.root}::marker`]:
          {
            margin: 0,
            color: palette.gray[70],
            fontSize: 16,
            fontStyle: "italic",
            fontWeight: 400,
            lineHeight: 1.5,
          },
      })}
      {...props}
    />
  );
};

export const Paragraph = ({ children }: { children?: ReactNode }) => {
  if (isValidElement(children)) {
    return children;
  }

  return (
    <Typography
      variant={"regularTextParagraphs"}
      component={"p"}
      sx={ParagraphSxProps}
    >
      {children}
    </Typography>
  );
};

const listSx: SxProps<Theme> = {
  p: 0,
  my: 1.25,
  ml: 3.5,
  "& ol, & ul": {
    ml: 1.5,
    mt: 0.5,
    mb: 0,
    py: 0,
  },
  "& li, & span": {
    margin: 0,
    padding: 0,
  },
  "& li": {
    pl: 0.5,
  },
  [`& .${listItemClasses.root}::marker`]: {
    color: (theme) => theme.palette.gray[50],
  },
};

export const OrderedList = (props: HTMLAttributes<HTMLOListElement>) => (
  <List
    component={"ol"}
    sx={{
      listStyle: "decimal",
      ...listSx,
    }}
    {...props}
  />
);

export const UnorderedList = (props: HTMLAttributes<HTMLUListElement>) => (
  <List
    sx={{
      listStyleType: "disc",
      ...listSx,
    }}
    {...props}
  />
);

export const ListItem = ({ children }: HTMLAttributes<HTMLLIElement>) => {
  return (
    <MuiListItem
      sx={{
        display: "list-item",
        pl: 1,
        py: 0,
        "&:not(:last-of-type)": { pb: 0.8 },
        "& p": { m: 0 },
      }}
    >
      {children}
    </MuiListItem>
  );
};

export const Pre = ({ children }: HTMLAttributes<HTMLElement>) => {
  if (isValidElement(children)) {
    const childProps: { className?: string; children: string } = children.props;

    return (
      <Box
        component={"pre"}
        sx={(theme) => ({
          overflow: "auto",
          display: "block",
          fontSize: "90%",
          color: theme.palette.white,
          background: "#2d2d2d",
          padding: theme.spacing(3),
          borderColor: "#161a1f",
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: "8px",
          textShadow: "none",
          marginBottom: 2,
          maxWidth: "100%",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          textAlign: "justify",
          "& code": {
            border: "none",
            padding: 0,
            margin: 0,
            backgroundColor: "inherit",
            fontSize: "100%",
          },
        })}
      >
        <Snippet
          source={childProps.children}
          language={childProps.className?.replace("language-", "") ?? ""}
          sx={{ m: 0, p: 0 }}
        />
      </Box>
    );
  }
};

export const Code = ({ children }: HTMLAttributes<HTMLElement>) => (
  <Typography
    component={"span"}
    sx={{
      padding: "0.2em 0.4em",
      margin: "0 0.15rem",
      fontFamily: `Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace`,
      fontSize: "85%",
      backgroundColor: "rgba(135, 131, 120, 0.15)",
      borderRadius: "0.25rem",
      color: ({ palette }) => palette.red[60],
    }}
  >
    {children}
  </Typography>
);
