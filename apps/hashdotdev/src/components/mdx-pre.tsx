import { Box } from "@mui/material";
import { ReactElement } from "react";

import { Snippet } from "./snippet";

/**
 * @todo copy button
 */
export const MdxPre = ({ children: codeEl }: { children: ReactElement }) => {
  const { className, children } = codeEl.props;
  return (
    <Box
      component="pre"
      sx={(theme) => ({
        overflow: "auto",
        display: "block",
        fontSize: "90%",
        color: theme.palette.gray[40],
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
        sx={{ padding: 0, margin: 0 }}
        source={`${children}`}
        language={
          typeof className === "string"
            ? className.replace("language-", "")
            : ""
        }
      />
    </Box>
  );
};
