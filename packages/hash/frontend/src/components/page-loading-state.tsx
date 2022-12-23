import { Box, Skeleton } from "@mui/material";

import { ProsemirrorLoadingState } from "../blocks/page/loading-view";
import { PAGE_CONTENT_WIDTH } from "../blocks/page/page-section-container";
import {
  PAGE_TITLE_FONT_SIZE,
  PAGE_TITLE_LINE_HEIGHT,
} from "../blocks/page/page-title/page-title";
import { pageIconVariantSizes } from "./page-icon";

export const PageLoadingState = () => {
  return (
    <Box maxWidth={PAGE_CONTENT_WIDTH} pt={6}>
      <Box display="flex">
        <Skeleton
          variant="rectangular"
          sx={{
            width: pageIconVariantSizes.medium.container,
            height: pageIconVariantSizes.medium.container,
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
