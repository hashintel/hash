import { Button } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import { ArrowUpIcon } from "../../icons/arrow-up";
import { TextIcon } from "../../icons/text";

export const TextPreview = ({
  onConfirm,
  onDiscard,
  prompt,
  text,
}: {
  onConfirm: () => void;
  onDiscard: () => void;
  prompt: string;
  text: string;
}) => {
  return (
    <Box>
      <Stack
        sx={({ palette }) => ({
          border: `1px solid ${palette.gray[20]}`,
          background: palette.gray[10],
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          paddingY: 2.125,
          paddingX: 3.75,
          gap: 0.75,
        })}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[70],
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            textTransform: "uppercase",
          }}
        >
          Prompt
        </Typography>

        <Stack flexDirection="row" gap={1.5} alignItems="center">
          <TextIcon
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[40] }}
          />
          <Typography
            sx={{
              color: ({ palette }) => palette.black,
              fontSize: 16,
              lineHeight: 1.3,
            }}
          >
            {prompt}
          </Typography>
        </Stack>
      </Stack>

      <Stack
        gap={1.25}
        sx={{
          width: 1,
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          border: ({ palette }) => `1px solid ${palette.gray[30]}`,
          borderBottomWidth: 0,
          paddingY: 2.75,
          paddingX: 3.75,
          borderTopWidth: 0,
        }}
      >
        <Typography
          sx={{
            color: ({ palette }) => palette.gray[70],
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            textTransform: "uppercase",
          }}
        >
          Output
        </Typography>

        <Typography
          sx={{
            color: ({ palette }) => palette.gray[90],
            fontSize: 16,
            lineHeight: 1.3,
          }}
        >
          {text}
        </Typography>
      </Stack>

      <Box
        sx={({ palette }) => ({
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: `1px solid ${palette.gray[30]}`,
          background: palette.gray[10],
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          borderTopWidth: 0,
          paddingY: 2.125,
          paddingX: 3.75,
        })}
      >
        <Box display="flex" gap={1}>
          <Button
            size="small"
            onClick={onConfirm}
            sx={{
              gap: 1,
              borderRadius: 1,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: "18px",
            }}
          >
            Insert Into Page
          </Button>

          <Button
            variant="tertiary"
            size="small"
            onClick={onDiscard}
            sx={{ fontSize: 14 }}
          >
            Discard this
          </Button>
        </Box>

        {/* <Box display="flex" gap={1}>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[80],
              fontSize: 14,
              lineHeight: "18px",
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            Return to Top
          </Typography>
          <ArrowUpIcon
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[40] }}
          />
        </Box> */}
      </Box>
    </Box>
  );
};
