import { Box } from "@mui/material";
import { ReactElement } from "react";

import { Snippet } from "./Snippet";

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
        color: theme.palette.purple[600],
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
        source={`${children}`}
        language={className?.replace("language-", "") ?? ""}
      />
    </Box>
  );
};
