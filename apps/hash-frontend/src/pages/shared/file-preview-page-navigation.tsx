import { Typography } from "@mui/material";

import { ArrowRightRegularIcon } from "@hashintel/design-system";

import { GrayToBlueIconButton } from "./gray-to-blue-icon-button";

type FilePreviewPageNavigationProps = {
  currentPage: number;
  onSelectPage: (pageNumber: number) => void;
  totalPages: number;
};

export const FilePreviewPageNavigation = ({
  currentPage,
  onSelectPage,
  totalPages,
}: FilePreviewPageNavigationProps) => (
  <>
    <GrayToBlueIconButton
      aria-label="Previous page"
      disabled={currentPage <= 1}
      onClick={() => onSelectPage(currentPage - 1)}
    >
      <ArrowRightRegularIcon sx={{ transform: "rotate(180deg)" }} />
    </GrayToBlueIconButton>
    <Typography
      sx={{
        fontSize: 12,
        color: ({ palette }) => palette.gray[70],
        textAlign: "center",
        width: (totalPages.toString().length * 2 + 4) * 7,
      }}
    >
      {`${currentPage} of ${totalPages}`}
    </Typography>
    <GrayToBlueIconButton
      aria-label="Next page"
      disabled={currentPage >= totalPages}
      onClick={() => onSelectPage(currentPage + 1)}
    >
      <ArrowRightRegularIcon />
    </GrayToBlueIconButton>
  </>
);
