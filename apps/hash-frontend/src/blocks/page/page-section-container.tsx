import { Box, SxProps } from "@mui/material";
import { ReactNode } from "react";

import { PageThread } from "../../components/hooks/use-page-comments";
import { useIsReadonlyMode } from "../../shared/readonly-mode";

export const PAGE_CONTENT_WIDTH = 696;
export const PAGE_MIN_PADDING = 48;
export const COMMENTS_WIDTH = 320;

export const getPageSectionContainerStyles = (
  pageComments: PageThread[],
  readonlyMode?: boolean,
) => {
  const commentsContainerWidth =
    !readonlyMode && pageComments.length
      ? COMMENTS_WIDTH + PAGE_MIN_PADDING
      : 0;

  const paddingLeft = `max(calc((100% - ${
    PAGE_CONTENT_WIDTH + commentsContainerWidth
  }px) / 2), ${PAGE_MIN_PADDING}px)`;
  const paddingRight = `calc(100% - ${PAGE_CONTENT_WIDTH}px - ${paddingLeft})`;

  return {
    padding: `${PAGE_MIN_PADDING}px ${paddingRight} 0 ${paddingLeft}`,
    minWidth: `calc(${PAGE_CONTENT_WIDTH}px + (${PAGE_MIN_PADDING}px * 2))`,
  };
};

export const PageSectionContainer = ({
  children,
  pageComments,
  sx = [],
}: {
  children: ReactNode;
  pageComments: PageThread[];
  sx?: SxProps;
}) => {
  const isReadonlyMode = useIsReadonlyMode();

  return (
    <Box
      sx={[
        getPageSectionContainerStyles(pageComments, isReadonlyMode),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
};
