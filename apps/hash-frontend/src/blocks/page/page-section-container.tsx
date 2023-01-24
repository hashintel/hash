import { Box, SxProps } from "@mui/material";
import { PropsWithChildren } from "react";

import { PageThread } from "../../components/hooks/use-page-comments";

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

export interface PageSectionContainerProps {
  pageComments: PageThread[];
  sx?: SxProps;
  readonly: boolean;
}

export const PageSectionContainer = ({
  children,
  pageComments,
  sx = [],
  readonly,
}: PropsWithChildren<PageSectionContainerProps>) => {
  return (
    <Box
      sx={[
        getPageSectionContainerStyles(pageComments, readonly),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
};
