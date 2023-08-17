import { EntityType, extractVersion } from "@blockprotocol/type-system/slim";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { ReactNode, useState } from "react";

import { isLinkEntityType } from "../../../../../../shared/entity-types-context/util";
import { ArrowUpRightIcon } from "../../../../../../shared/icons/arrow-up-right-icon";
import { LinkedIcon } from "../../../../../../shared/icons/linked-icon";
import { Button, Link, Modal } from "../../../../../../shared/ui";
import { CreateEntityTypeForm } from "../../../../../shared/create-entity-type-form";
import { EntityTypeDescription } from "../entity-type-description";

interface EntityTypeHeaderProps {
  ontologyChip: ReactNode;
  entityType: EntityType;
  isDraft: boolean;
  isReadonly: boolean;
  latestVersion?: number | null;
}

export const EntityTypeHeader = ({
  ontologyChip,
  entityType,
  isDraft,
  isReadonly,
  latestVersion,
}: EntityTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

  const entityTypeIsLink = isLinkEntityType(entityType);

  const isLatest =
    !latestVersion || extractVersion(entityType.$id) === latestVersion;
  const latestVersionUrl = entityType.$id.replace(/\d+$/, `${latestVersion}`);

  return (
    <>
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
              <Typography
                color="inherit"
                sx={{ fontSize: 11, fontWeight: 600 }}
              >
                {`–> v${latestVersion} available`}
              </Typography>
            </Link>
          )}
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
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
          {!isReadonly && !isDraft ? (
            <Button
              onClick={() => setShowExtendTypeModal(true)}
              variant="secondary"
              size="small"
            >
              Extend type <ArrowUpRightIcon sx={{ fontSize: 16, ml: 1.5 }} />
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ mb: 5.25 }}>
          <EntityTypeDescription readonly={isReadonly} />
        </Box>
      </Box>
      <Modal open={showExtendTypeModal} contentStyle={{ p: "0px !important" }}>
        <>
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[80],
              fontWeight: 500,
              p: 3,
              pb: 0,
            })}
          >
            Create new entity type
          </Typography>
          <Box p={3}>
            <CreateEntityTypeForm
              initialData={{ extendsEntityTypeId: entityType.$id }}
              onCancel={() => setShowExtendTypeModal(false)}
            />
          </Box>
        </>
      </Modal>
    </>
  );
};
