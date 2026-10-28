import { Box, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { useId } from "react";

import { extractVersion } from "@blockprotocol/type-system";
import { TypeCard } from "@hashintel/design-system";
import { fluidFontClassName } from "@hashintel/design-system/theme";

import { generateLinkParameters } from "../../../../../shared/generate-link-parameters";
import { Link } from "../../../../../shared/ui/link";

import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ReactNode } from "react";

export const DependentTypesSection = ({
  heading,
  emptyMessage,
  types,
  error,
  isLinkType,
  onTypeClick,
}: {
  heading: ReactNode;
  emptyMessage: ReactNode;
  types: EntityTypeWithMetadata[] | undefined;
  error: Error | undefined;
  isLinkType: (type: EntityTypeWithMetadata) => boolean;
  onTypeClick: (typeId: VersionedUrl) => void;
}) => {
  const failed = types === undefined && !!error;
  const loading = types === undefined && !error;

  const headingId = useId();

  return (
    <Box
      component="section"
      aria-busy={loading}
      aria-labelledby={headingId}
      className={fluidFontClassName}
    >
      <Typography id={headingId} variant="h5" sx={{ mb: 2 }}>
        {heading}
      </Typography>
      {failed ? (
        <Typography sx={{ color: "error.main", fontSize: "var(--step--1)" }}>
          Couldn't load these types. Reload the page to try again.
        </Typography>
      ) : null}
      {loading ? <Skeleton variant="rounded" height={40} /> : null}
      {types?.length === 0 ? (
        <Box
          sx={({ palette }) => ({
            display: "inline-block",
            background: palette.gray[20],
            border: `1px solid ${palette.gray[30]}`,
            borderRadius: 1.5,
            color: palette.gray[80],
            fontSize: "var(--step--1)",
            px: 2,
            py: 1,
          })}
        >
          {emptyMessage}
        </Box>
      ) : null}
      {types && types.length > 0 ? (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1.5 }}>
          {types.map((type) => (
            <Tooltip key={type.schema.$id} title={type.schema.description}>
              <Box>
                <TypeCard
                  icon={type.schema.icon}
                  isLink={isLinkType(type)}
                  LinkComponent={Link}
                  onClick={() => onTypeClick(type.schema.$id)}
                  title={type.schema.title}
                  url={generateLinkParameters(type.schema.$id).href}
                  version={extractVersion(type.schema.$id)}
                />
              </Box>
            </Tooltip>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
};
