import { Stack, Typography } from "@mui/material";

export const EditorTitle = () => (
  <Stack gap={1}>
    <Typography sx={{ fontWeight: 500 }}>QUERY FOR ENTITIES</Typography>
    <Typography sx={{ color: ({ palette }) => palette.gray[70], fontSize: 14 }}>
      Queries return entities matching specified parameters and display them in
      the table
    </Typography>
  </Stack>
);
