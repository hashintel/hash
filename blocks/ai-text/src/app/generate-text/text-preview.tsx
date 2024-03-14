import { AiAssistantMessage } from "@hashintel/block-design-system";
import { ArrowRotateLeftIcon, Button } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";

import { BroomWideIcon } from "../../icons/broom-wide";
import { CheckIcon } from "../../icons/check";
import { TextIcon } from "../../icons/text";

export const TextPreview = ({
  onConfirm,
  onRegenerate,
  onDiscard,
  prompt,
  text,
}: {
  onConfirm: () => void;
  onRegenerate: () => void;
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
          boxSizing: "border-box",
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

        <AiAssistantMessage messageContent={text} />
      </Stack>

      <Box
        sx={({ palette }) => ({
          boxSizing: "border-box",
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
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            size="small"
            onClick={onConfirm}
            sx={{
              borderRadius: 1,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: "18px",
            }}
          >
            Insert Into Page
            <CheckIcon sx={{ fontSize: "inherit", ml: 1.25 }} />
          </Button>

          <Button
            variant="tertiary"
            size="small"
            onClick={onRegenerate}
            sx={{ fontSize: 14 }}
          >
            Regenerate output
            <ArrowRotateLeftIcon sx={{ fontSize: "inherit", ml: 1.25 }} />
          </Button>

          <Button
            variant="tertiary_quiet"
            size="small"
            onClick={onDiscard}
            sx={({ palette }) => ({
              fontSize: 14,
              color: palette.gray[50],
              background: "transparent",
              ":hover": {
                background: "transparent",
                color: palette.gray[60],
              },
            })}
          >
            Discard
            <BroomWideIcon sx={{ fontSize: "inherit", ml: 1.25 }} />
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
          <ArrowUpRegularIcon
            sx={{ fontSize: 16, color: ({ palette }) => palette.gray[40] }}
          />
        </Box> */}
      </Box>
    </Box>
  );
};
