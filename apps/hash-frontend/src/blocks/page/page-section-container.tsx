import { Box, SxProps } from "@mui/material";
import { PropsWithChildren } from "react";

import { PageThread } from "../../components/hooks/use-page-comments";

export const PAGE_CONTENT_WIDTH = 696;
export const COMMENTS_WIDTH = 320;

export const getPageSectionContainerStyles = (params: {
  pageComments?: PageThread[];
  readonly?: boolean;
  paddingY?: number;
}) => {
  const { pageComments, readonly, paddingY = 0 } = params;

  const commentsContainerWidth =
    !readonly && pageComments?.length ? COMMENTS_WIDTH + paddingY : 0;

  const paddingLeft = `max(calc((100% - ${
    PAGE_CONTENT_WIDTH + commentsContainerWidth
  }px) / 2), ${paddingY}px)`;
  const paddingRight = `calc(100% - ${PAGE_CONTENT_WIDTH}px - ${paddingLeft})`;

  return {
    padding: `${paddingY}px ${paddingRight} 0 ${paddingLeft}`,
    minWidth: `calc(${PAGE_CONTENT_WIDTH}px + (${paddingY}px * 2))`,
  };
};

export interface PageSectionContainerProps {
  pageComments?: PageThread[];
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
        ...(pageComments
          ? [getPageSectionContainerStyles({ pageComments, readonly })]
          : []),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
};
