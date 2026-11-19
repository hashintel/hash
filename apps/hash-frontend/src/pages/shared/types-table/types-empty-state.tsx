import { Box, Stack, Typography } from "@mui/material";

import { FilesLightIcon } from "../../../shared/icons/files-light-icon";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { Button } from "../../../shared/ui/button";

import type { FunctionComponent } from "react";

type TypesEmptyStateProps = {
  title: string;
  onClearFilters?: () => void;
  onIncludePublicTypes?: () => void;
} & (
  | { createEntityTypeHref: string; description: string }
  | { createEntityTypeHref?: never; description?: never }
);

/**
 * Shown in place of the types table's rows when none are visible. With
 * `createEntityTypeHref` it prompts the user to create their first type.
 */
export const TypesEmptyState: FunctionComponent<TypesEmptyStateProps> = ({
  title,
  description,
  createEntityTypeHref,
  onClearFilters,
  onIncludePublicTypes,
}) => (
  <Stack sx={{ alignItems: "center", gap: 1.5, px: 3, textAlign: "center" }}>
    {createEntityTypeHref ? (
      <Box
        sx={({ palette }) => ({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: palette.gray[10],
          border: `1px solid ${palette.gray[20]}`,
        })}
      >
        <FilesLightIcon
          sx={({ palette }) => ({ fontSize: 20, fill: palette.gray[50] })}
        />
      </Box>
    ) : null}
    <Stack sx={{ alignItems: "center", gap: 0.5 }}>
      <Typography
        component="h2"
        sx={({ palette }) => ({
          color: palette.gray[90],
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.5,
        })}
      >
        {title}
      </Typography>
      {description ? (
        <Typography
          sx={({ palette }) => ({
            color: palette.gray[60],
            fontSize: 14,
            lineHeight: 1.5,
          })}
        >
          {description}
        </Typography>
      ) : null}
    </Stack>
    {createEntityTypeHref || onClearFilters || onIncludePublicTypes ? (
      <Stack direction="row" sx={{ gap: 1 }}>
        {createEntityTypeHref ? (
          <Button
            href={createEntityTypeHref}
            size="xs"
            startIcon={<PlusRegularIcon />}
          >
            Create an entity type
          </Button>
        ) : null}
        {onClearFilters ? (
          <Button onClick={onClearFilters} size="xs" variant="tertiary">
            Clear filters
          </Button>
        ) : null}
        {onIncludePublicTypes ? (
          <Button onClick={onIncludePublicTypes} size="xs" variant="tertiary">
            Show all public types
          </Button>
        ) : null}
      </Stack>
    ) : null}
  </Stack>
);
