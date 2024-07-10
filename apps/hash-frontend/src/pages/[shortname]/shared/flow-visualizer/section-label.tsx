import { Typography } from "@mui/material";

export const SectionLabel = ({ text }: { text: string }) => (
  <Typography
    variant="smallCaps"
    sx={{
      color: ({ palette }) => palette.gray[50],
    }}
  >
    {text}
  </Typography>
);
