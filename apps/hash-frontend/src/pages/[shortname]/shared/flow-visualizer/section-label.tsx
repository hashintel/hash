import { Typography } from "@mui/material";

export const SectionLabel = ({ text }: { text: string }) => (
  <Typography
    component="div"
    variant="smallCaps"
    sx={{
      color: ({ palette }) => palette.gray[50],
      mb: 0.4,
    }}
  >
    {text}
  </Typography>
);
