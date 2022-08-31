import { Box, Container, Skeleton } from "@mui/material";
import { ProsemirrorLoadingState } from "../blocks/page/LoadingView";
import { PAGE_CONTENT_WIDTH } from "../pages/[account-slug]/[page-slug].page";
import { pageIconVariantSizes } from "./PageIcon";

export const PageLoadingState = () => {
  return (
    <Container>
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
            <Skeleton sx={{ mt: -1.75, width: "50%", height: 70 }} />
            <ProsemirrorLoadingState />
          </Box>
        </Box>
      </Box>
    </Container>
  );
};
