import { Button } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import { ArrowLeftIcon } from "../../../icons/arrow-left";
import { SquareDashedCirclePlusIcon } from "../../../icons/square-dashed-circle-plus";

export const ImageDetails = ({
  generatedAt,
  isMobile,
  onSubmit,
  onCancel,
}: {
  generatedAt: string;
  isMobile?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) => {
  return (
    <Stack
      sx={{
        justifyContent: "space-around",
        transition: ({ transitions }) => transitions.create("max-height"),
      }}
      gap={isMobile ? 6 : 9.75}
    >
      <Stack gap={3}>
        <Stack gap={0.75}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              textTransform: "uppercase",
            }}
          >
            Image Dimensions
          </Typography>

          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontSize: 16,
              lineHeight: 1.2,
            }}
          >
            1024 x 1024 pixels
          </Typography>
        </Stack>

        <Stack gap={0.75}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              textTransform: "uppercase",
            }}
          >
            Generated At
          </Typography>

          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontSize: 16,
              lineHeight: 1.2,
            }}
          >
            {generatedAt}
          </Typography>
        </Stack>

        <Box mt={1.5}>
          <Button
            size="small"
            onClick={() => onSubmit()}
            sx={{
              gap: 1,
              borderRadius: 1,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: "18px",
            }}
          >
            Insert this image
            <SquareDashedCirclePlusIcon
              sx={{
                fontSize: 16,
              }}
            />
          </Button>
        </Box>
      </Stack>

      <Box>
        <Button
          variant="tertiary"
          size="small"
          onClick={() => onCancel()}
          sx={({ palette }) => ({
            gap: 1,
            borderRadius: 1,
            fontSize: 14,
            fontWeight: 500,
            lineHeight: "18px",
            color: palette.gray[70],
            fill: palette.gray[50],

            ":hover": {
              fill: palette.gray[80],
            },
          })}
        >
          <ArrowLeftIcon
            sx={{
              fontSize: 16,
              fill: "inherit",
            }}
          />
          Return to options
        </Button>
      </Box>
    </Stack>
  );
};
