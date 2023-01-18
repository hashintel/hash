import { Box } from "@mui/material";

export const ROW_DEPTH_INDENTATION = 20;

type CollapsibleRowLineProps = {
  height: string;
  depth: number;
};

export const CollapsibleRowLine = ({
  height,
  depth,
}: CollapsibleRowLineProps) => (
  <Box
    sx={{
      boxSizing: "content-box",
      display: "flex",
      justifyContent: "center",
      position: "absolute",
      height,
      width: 8,
      left: `${ROW_DEPTH_INDENTATION * depth}px`,
      top: 0,
      zIndex: 1,
      pl: 1.25,
    }}
  >
    <Box
      sx={{
        height: 1,
        width: "1px",
        background: ({ palette }) => palette.gray[30],
      }}
    />
  </Box>
);
