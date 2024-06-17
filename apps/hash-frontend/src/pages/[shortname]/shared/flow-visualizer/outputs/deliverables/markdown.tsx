import { Backdrop, Box, Slide, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { PageIcon } from "../../../../../../components/page-icon";
import { Markdown } from "../../../../../shared/markdown";
import type { DeliverableData } from "./shared/types";

export const MarkdownDeliverable = ({
  deliverable,
}: {
  deliverable: DeliverableData & { type: "markdown" };
}) => {
  const { displayName, markdown } = deliverable;
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <Backdrop
        open={showPreview}
        onClick={() => setShowPreview(false)}
        sx={{
          zIndex: ({ zIndex }) => zIndex.drawer + 2,
          justifyContent: "flex-end",
        }}
      >
        <Slide
          in={showPreview}
          direction="left"
          onClick={(event) => event.stopPropagation()}
        >
          <Box
            sx={{
              height: "100vh",
              overflowY: "auto",
              background: ({ palette }) => palette.common.white,
              maxWidth: { xs: "95vw", md: "80vw" },
              textAlign: "left",
              px: 6,
              py: 4,
            }}
          >
            <Markdown markdown={markdown} />
          </Box>
        </Slide>
      </Backdrop>

      <Stack
        direction="row"
        gap={1.5}
        sx={{ alignItems: "center", textAlign: "left" }}
      >
        <PageIcon
          sx={{
            fill: ({ palette }) => palette.gray[30],
            fontSize: 36,
          }}
        />
        <Box>
          <Typography
            component="div"
            variant="smallTextParagraphs"
            sx={{ fontWeight: 600, lineHeight: 1.3, mb: 0.5 }}
          >
            {displayName}
          </Typography>
          <Stack alignItems="center" direction="row" gap={1}>
            <Box
              component="button"
              onClick={() => setShowPreview(true)}
              sx={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <Typography
                sx={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  color: ({ palette }) => palette.gray[60],
                  textTransform: "uppercase",
                }}
              >
                Open preview
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </>
  );
};
