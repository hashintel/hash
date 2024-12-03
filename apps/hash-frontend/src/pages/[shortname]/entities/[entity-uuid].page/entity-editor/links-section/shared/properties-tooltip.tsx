import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactElement } from "react";

import { useEntityEditor } from "../../entity-editor-context";

export const PropertiesTooltip = ({
  children,
  entityType,
  properties,
}: {
  children: ReactElement;
  properties: { [propertyTitle: string]: string };
  entityType: "link entity" | "source entity" | "target entity";
}) => {
  const { slideContainerRef } = useEntityEditor();

  return (
    <Tooltip
      componentsProps={{
        popper: {
          container: slideContainerRef?.current,
        },
        tooltip: {
          sx: { maxHeight: 300, overflowY: "auto" },
        },
      }}
      title={
        Object.keys(properties).length > 0 ? (
          <Stack gap={1} pb={0.5}>
            {Object.entries(properties)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([propertyTitle, propertyValue]) => (
                <Box component="div" key={propertyTitle}>
                  <Typography
                    component="div"
                    sx={{
                      color: ({ palette }) => palette.gray[30],
                      letterSpacing: 0,
                      fontSize: 11,
                      mb: 0.2,
                    }}
                    variant="smallCaps"
                  >
                    {propertyTitle}
                  </Typography>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.common.white,
                      fontSize: 12,
                      lineHeight: 1.3,
                    }}
                  >
                    {stringifyPropertyValue(propertyValue)}
                  </Typography>
                </Box>
              ))}
          </Stack>
        ) : (
          `This ${entityType} has no properties`
        )
      }
    >
      <Box sx={{ display: "inline-block", maxWidth: "100%" }}>{children}</Box>
    </Tooltip>
  );
};
