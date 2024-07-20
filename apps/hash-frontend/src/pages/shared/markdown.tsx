import type { LegacyRef } from "react";
import ReactMarkdown, type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Box,
  type SxProps,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  type Theme,
  Typography,
} from "@mui/material";

import { Link } from "../../shared/ui/link";

import {
  BlockQuote,
  Code,
  ListItem,
  OrderedList,
  Pre,
  UnorderedList,
} from "./markdown/elements";

interface MarkdownProps {
  markdown: string;
}

const borderRadius = "10px";

const tableCellSx: SxProps<Theme> = {
  fontSize: 14,
  padding: "6px 16px",
  borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
  "&:not(:last-of-type)": {
    borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
  },
  textAlign: "left",
};

const omitRefFromProps = <
  T extends { ref?: LegacyRef<unknown>; node?: unknown },
>({
  ref: _ref,
  node: _node,
  ...props
}: T): Omit<T, "ref" | "node"> => props;

const components: Partial<Components> = {
  a: (props) => <Link {...omitRefFromProps(props)} href={props.href ?? ""} />,
  blockquote: (props) => <BlockQuote {...omitRefFromProps(props)} />,
  code: (props) => <Code {...omitRefFromProps(props)} />,
  h1: (props) => (
    <Typography
      variant={"h1"}
      {...omitRefFromProps(props)}
      sx={{ mt: 4, mb: 1.5, fontSize: 36 }}
    />
  ),
  h2: (props) => (
    <Typography
      variant={"h2"}
      {...omitRefFromProps(props)}
      sx={{ mt: 3.5, mb: 1.5, fontSize: 32 }}
    />
  ),
  h3: (props) => (
    <Typography
      variant={"h3"}
      {...omitRefFromProps(props)}
      sx={{ mt: 2.5, mb: 1.5, fontSize: 28 }}
    />
  ),
  h4: (props) => (
    <Typography
      variant={"h4"}
      {...omitRefFromProps(props)}
      sx={{ mt: 2.5, mb: 1.5 }}
    />
  ),
  h5: (props) => (
    <Typography
      variant={"h5"}
      {...omitRefFromProps(props)}
      sx={{ mt: 2.5, mb: 1.5 }}
    />
  ),
  h6: (props) => (
    <Typography
      variant={"h5"}
      {...omitRefFromProps(props)}
      sx={{ mt: 2.5, mb: 1.5 }}
    />
  ),
  img: (props) => (
    <Box sx={{ width: "100%", textAlign: "center" }}>
      <Box
        component={"img"}
        {...omitRefFromProps(props)}
        alt={props.alt ?? ""}
        sx={{ maxHeight: 300 }}
      />
    </Box>
  ),
  li: (props) => <ListItem {...omitRefFromProps(props)} />,
  ol: (props) => <OrderedList {...omitRefFromProps(props)} />,
  p: (props) => <Typography {...omitRefFromProps(props)} my={1.5} />,
  pre: (props) => <Pre {...omitRefFromProps(props)} />,
  table: (props) => (
    <TableContainer
      sx={{
        background: "white",
        borderRadius,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        my: 2,
      }}
    >
      <Table
        {...omitRefFromProps(props)}
        sx={{
          borderCollapse: "separate",
          borderRadius,
          borderSpacing: 0,
        }}
      />
    </TableContainer>
  ),
  tbody: (props) => <TableBody {...omitRefFromProps(props)} />,
  thead: (props) => <TableHead {...omitRefFromProps(props)} />,
  tr: (props) => <TableRow {...omitRefFromProps(props)} />,
  th: ({ align: _align, ...props }) => (
    <TableCell {...omitRefFromProps(props)} sx={tableCellSx} />
  ),
  td: ({ align: _align, ...props }) => (
    <TableCell {...omitRefFromProps(props)} sx={tableCellSx} />
  ),
  ul: (props) => <UnorderedList {...omitRefFromProps(props)} />,
};

export const Markdown = ({ markdown }: MarkdownProps) => {
  return (
    <Box
      sx={{
        /**
         * We need first-child here because we only want 0 margin on the first element in the Markdown, not the first of every type
         * the warning is related to (a) emotion injecting script tags in places (b) in SSR. It doesn't matter here.
         */
        /* emotion-disable-server-rendering-unsafe-selector-warning-please-do-not-use-this-the-warning-exists-for-a-reason */
        "& :first-child:not(style)": { mt: 0 },
      }}
    >
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {markdown}
      </ReactMarkdown>
    </Box>
  );
};
