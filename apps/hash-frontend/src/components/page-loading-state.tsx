import { Box, Skeleton } from "@mui/material";

import { pageContentWidth } from "../pages/[shortname]/[page-slug].page";
import { ProsemirrorLoadingState } from "../pages/shared/block-collection/loading-view";
import {
  PAGE_TITLE_FONT_SIZE,
  PAGE_TITLE_LINE_HEIGHT,
} from "../pages/shared/block-collection/page-title/page-title";
import { iconVariantSizes } from "../pages/shared/edit-icon-button";

export const PageLoadingState = () => {
  return (
    <Box maxWidth={pageContentWidth} pt={6}>
      <Box display="flex">
        <Skeleton
          variant="rectangular"
          sx={{
            width: iconVariantSizes.medium.container,
            height: iconVariantSizes.medium.container,
            mr: 3,
            borderRadius: 1,
          }}
        />

        <Box flex={1}>
          <Skeleton
            variant="rectangular"
            sx={{
              width: "50%",
              height: `calc(${PAGE_TITLE_FONT_SIZE} * ${PAGE_TITLE_LINE_HEIGHT})`,
              borderRadius: 1,
              mb: 5,
            }}
          />
          <ProsemirrorLoadingState />
        </Box>
      </Box>
    </Box>
  );
};
