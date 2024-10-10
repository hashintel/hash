import { Stack, Typography } from "@mui/material";

export const PropertiesTooltipContent = ({
  properties,
}: {
  properties: { [propertyTitle: string]: string };
}) => (
  <Stack gap={0.5} sx={{ maxHeight: 300, overflowY: "auto", p: 1 }}>
    {Object.entries(properties)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([propertyTitle, propertyValue]) => (
        <Typography
          component="div"
          key={propertyTitle}
          sx={{
            color: ({ palette }) => palette.common.white,
            fontSize: 13,
          }}
          variant="smallTextParagraphs"
        >
          <strong>{propertyTitle}: </strong>
          {propertyValue}
        </Typography>
      ))}
  </Stack>
);
