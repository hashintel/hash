import { Box } from "@mui/material";
import { BoxProps } from "@mui/system";

/**
 * @todo copy button
 */
export const MdxPre = ({ children, ...props }: BoxProps<"pre">) => {
  return (
    <Box
      component="pre"
      {...props}
      sx={{
        bgcolor: "gray.10",
        p: 2.75,
        border: 1,
        borderColor: "gray.20",
        borderRadius: "4px",
        maxWidth: "100%",
        overflow: "auto",
        color: "gray.80",
        // @todo check this
        fontFamily:
          "'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans" +
          " Mono', Menlo, Consolas, monospace",
        fontSize: "var(--step--1)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </Box>
  );
};
