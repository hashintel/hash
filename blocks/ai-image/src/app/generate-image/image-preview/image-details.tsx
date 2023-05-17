import { Stack, Typography } from "@mui/material";

export const ImageDetails = ({
  generatedAt,
  isMobile = false,
}: {
  generatedAt: string;
  isMobile?: boolean;
}) => {
  return (
    <Stack
      sx={{
        gap: 1.5,
        ...(isMobile
          ? {
              flexDirection: "row",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }
          : {}),
      }}
    >
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
    </Stack>
  );
};
