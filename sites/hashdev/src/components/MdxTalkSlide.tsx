import { Box, Typography } from "@mui/material";
import Image from "next/image";
import { FunctionComponent } from "react";

export const MdxTalkSlide: FunctionComponent<{
  src: string;
  width: string;
  height: string;
  video?: boolean;
}> = ({ children, src, video = false, width, height }) => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        width: { xs: "100%", lg: "100vw" },
        maxWidth: { xs: "100%", lg: 1100, xl: 1200 },
        flexWrap: { xs: "wrap", lg: "no-wrap" },
        marginBottom: 2,
        margin: { lg: "40px auto" },
        gridColumn: { lg: "1 / span 3 " },
      }}
    >
      <Box sx={{ width: { xs: "100%", lg: "55%" } }}>
        {video ? (
          <Box component="video" width="100%" src={src} controls />
        ) : (
          <Image src={src} width={width} height={height} />
        )}
      </Box>
      <Box
        sx={{
          width: { xs: "100%", lg: "40%" },
          marginTop: { xs: 2, lg: 0 },
          "p ": { marginBottom: 1 },
        }}
      >
        <Typography>{children}</Typography>
      </Box>
    </Box>
  );
};
