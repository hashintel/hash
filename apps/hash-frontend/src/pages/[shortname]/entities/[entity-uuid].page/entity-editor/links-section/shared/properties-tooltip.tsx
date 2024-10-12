import { Stack, Tooltip, Typography } from "@mui/material";
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
      }}
      title={
        Object.keys(properties).length > 0 ? (
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
        ) : (
          `This ${entityType} has no properties`
        )
      }
    >
      {children}
    </Tooltip>
  );
};
