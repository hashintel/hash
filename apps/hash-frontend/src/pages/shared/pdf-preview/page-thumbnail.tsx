import { Box } from "@mui/material";
import { memo } from "react";
import { Thumbnail } from "react-pdf";

import { thumbnailWidth } from "./dimensions";

type PageThumbnailProps = {
  height: number;
  pageNumber: number;
  setSelectedPageNumber: (pageNumber: number) => void;
  selectedPageNumber: number;
};

export const PageThumbnail = memo(
  ({
    height,
    pageNumber,
    selectedPageNumber,
    setSelectedPageNumber,
  }: PageThumbnailProps) => {
    return (
      <Box
        sx={({ palette }) => ({
          background: palette.common.white,
          border: `1px solid ${palette.gray[20]}`,
          outlineStyle: "solid",
          outlineOffset: 2,
          outlineWidth: 4,
          outlineColor:
            pageNumber === selectedPageNumber
              ? palette.blue[20]
              : "transparent",
          width: thumbnailWidth,
          minHeight: height,
          height,
          overflow: "hidden",
        })}
      >
        <Thumbnail
          loading={<Box sx={{ height, width: thumbnailWidth }} />}
          pageNumber={pageNumber}
          height={height}
          width={thumbnailWidth}
          onItemClick={(args) => setSelectedPageNumber(args.pageNumber)}
          onMouseEnter={() => setSelectedPageNumber(pageNumber)}
        />
      </Box>
    );
  },
);
