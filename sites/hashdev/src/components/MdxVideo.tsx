import { Box } from "@mui/material";
import { VoidFunctionComponent } from "react";

export const MdxVideo: VoidFunctionComponent<{
  src: string;
  title: string;
}> = ({ src, title }) => {
  const mediaProps = {
    src,
    title,
    style: {
      height: "100%",
      position: "absolute" as "absolute",
      top: 0,
      left: 0,
      width: "100%",
    },
  };

  if (src?.includes("youtube")) {
    return (
      <Box style={{ position: "relative", paddingTop: "55%" }}>
        {/* eslint-disable-next-line jsx-a11y/iframe-has-title -- it does */}
        <iframe
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          {...mediaProps}
        />
      </Box>
    );
  }
  return (
    <Box style={{ position: "relative", paddingTop: "55%" }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video {...mediaProps} />
    </Box>
  );
};
