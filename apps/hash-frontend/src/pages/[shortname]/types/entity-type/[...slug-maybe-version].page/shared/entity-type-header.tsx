import { EntityType, extractVersion } from "@blockprotocol/type-system/slim";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { ReactNode } from "react";

import { LinkedIcon } from "../../../../../../shared/icons/linked-icon";
import { Link } from "../../../../../../shared/ui/link";
import { isLinkEntityType } from "../../[...slug-maybe-version].page";
import { EntityTypeDescription } from "../entity-type-description";

interface EntityTypeHeaderProps {
  ontologyChip: ReactNode;
  entityType: EntityType;
  isReadonly: boolean;
  latestVersion?: number | null;
}

export const EntityTypeHeader = ({
  ontologyChip,
  entityType,
  isReadonly,
  latestVersion,
}: EntityTypeHeaderProps) => {
  const entityTypeIsLink = isLinkEntityType(entityType);

  const isLatest =
    !latestVersion || extractVersion(entityType.$id) === latestVersion;
  const latestVersionUrl = entityType.$id.replace(/\d+$/, `${latestVersion}`);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {ontologyChip}

        {!isLatest && (
          <Link
            href={latestVersionUrl}
            sx={{
              textDecoration: "none",
            }}
          >
            <Typography color="inherit" sx={{ fontSize: 11, fontWeight: 600 }}>
              {`–> v${latestVersion} available`}
            </Typography>
          </Link>
        )}
      </Stack>
      <Typography variant="h1" fontWeight="bold" my={3}>
        {entityTypeIsLink ? (
          <Tooltip
            title="This is a 'link' entity type. It is used to link other entities together."
            placement="top"
          >
            <Box display="inline-flex">
              <LinkedIcon
                sx={({ palette }) => ({
                  fontSize: 40,
                  mr: 2,
                  stroke: palette.gray[50],
                  verticalAlign: "middle",
                })}
              />
            </Box>
          </Tooltip>
        ) : (
          <FontAwesomeIcon
            icon={faAsterisk}
            sx={({ palette }) => ({
              fontSize: 40,
              mr: 3,
              color: palette.gray[70],
              verticalAlign: "middle",
            })}
          />
        )}

        {entityType.title}
      </Typography>

      <Box sx={{ mb: 5.25 }}>
        <EntityTypeDescription readonly={isReadonly} />
      </Box>
    </Box>
  );
};
