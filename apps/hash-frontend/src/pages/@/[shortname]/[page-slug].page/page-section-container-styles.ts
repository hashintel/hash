import type { PageThread } from "../../../../components/hooks/use-page-comments";

export const pageContentWidth = 696;
export const commentsWidth = 320;
export const pageMinPadding = 48;

export const getPageSectionContainerStyles = (params: {
  pageComments?: PageThread[];
  readonly?: boolean;
}) => {
  const { pageComments, readonly } = params;

  const commentsContainerWidth =
    !readonly && pageComments?.length ? commentsWidth + pageMinPadding : 0;

  const paddingLeft = `max(calc((100% - ${
    pageContentWidth + commentsContainerWidth
  }px) / 2), ${pageMinPadding}px)`;
  const paddingRight = `calc(100% - ${pageContentWidth}px - ${paddingLeft})`;

  return {
    paddingLeft,
    paddingRight,
    minWidth: `calc(${pageContentWidth}px + (${pageMinPadding}px * 2))`,
  };
};
