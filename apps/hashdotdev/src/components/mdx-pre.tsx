import { Box } from "@mui/material";
import { Children, HTMLAttributes, isValidElement } from "react";

import { mdxComponents } from "../util/mdx-components";
import { Link } from "./link";
import { Snippet } from "./snippet";

/**
 * @todo copy button
 */

// block code (```) - consists of <pre><code>...</code></pre>
export const MdxPre = ({ children, ...rest }: HTMLAttributes<HTMLElement>) => {
  const [child, ...otherChildren] = Children.toArray(children);
  if (
    isValidElement(child) &&
    child.type === mdxComponents.code &&
    !otherChildren.length
  ) {
    const childProps: { className: string; children: string } = child.props;
    const isLanguageBlockFunction =
      childProps.className === "language-block-function";

    if (isLanguageBlockFunction) {
      const anchor = childProps.children.match(/^[\w]+/)?.[0] ?? "";
      return (
        <Box
          id={anchor}
          component="code"
          sx={{
            fontWeight: "bold",
            color: "#d18d5b",
            display: "block",
            marginTop: 4,
          }}
        >
          <Link href={`#${anchor}`}>{childProps.children}</Link>
        </Box>
      );
    }

    return (
      <Box
        component="pre"
        sx={(theme) => ({
          overflow: "auto",
          display: "block",
          fontSize: "90%",
          color: theme.palette.white,
          background: "#161a1f",
          padding: theme.spacing(3),
          borderWidth: 1,
          borderStyle: "solid",
          borderRadius: "8px",
          textShadow: "none",
          marginBottom: 2,
          maxWidth: "72ch",
        })}
      >
        <Snippet
          source={`${childProps.children}`}
          language={childProps.className.replace("language-", "")}
        />
      </Box>
    );
  }

  // fallback
  return <pre {...rest}>{children}</pre>;
};
