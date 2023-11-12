import { EntityType, extractVersion } from "@blockprotocol/type-system/slim";
import {
  ArrowUpRightIcon,
  EntityTypeIcon,
  LinkTypeIcon,
} from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { ReactNode, useState } from "react";

import { generateLinkParameters } from "../../../../shared/generate-link-parameters";
import { Button, Link, Modal } from "../../../../shared/ui";
import { CreateEntityTypeForm } from "../../create-entity-type-form";
import { EntityTypeDescription } from "../entity-type-description";

interface EntityTypeHeaderProps {
  isPreviewSlide?: boolean;
  ontologyChip: ReactNode;
  entityType: EntityType;
  isDraft: boolean;
  isLink: boolean;
  isReadonly: boolean;
  latestVersion?: number | null;
}

export const EntityTypeHeader = ({
  isPreviewSlide,
  ontologyChip,
  entityType,
  isDraft,
  isLink,
  isReadonly,
  latestVersion,
}: EntityTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

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
              href={generateLinkParameters(latestVersionUrl).href}
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
            {isLink ? (
              <Tooltip
                title="This is a 'link' entity type. It is used to link other entities together."
                placement="top"
              >
                <Box display="inline-flex">
                  <LinkTypeIcon
                    sx={({ palette }) => ({
                      fontSize: 40,
                      mr: 2,
                      stroke: palette.gray[50],
                    })}
                  />
                </Box>
              </Tooltip>
            ) : (
              <EntityTypeIcon
                sx={({ palette }) => ({
                  fontSize: 40,
                  mr: 2,
                  fill: palette.gray[50],
                })}
              />
            )}

            {entityType.title}
          </Typography>
          {!isDraft && !isPreviewSlide ? (
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
      <Modal
        open={showExtendTypeModal}
        contentStyle={{ padding: "0px !important" }}
      >
        <>
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[80],
              fontWeight: 500,
              px: 2.5,
              pt: 2,
              pb: 1.5,
            })}
          >
            Create new entity type
          </Typography>
          <Box>
            <CreateEntityTypeForm
              afterSubmit={() => setShowExtendTypeModal(false)}
              inModal
              initialData={{ extendsEntityTypeId: entityType.$id }}
              onCancel={() => setShowExtendTypeModal(false)}
            />
          </Box>
        </>
      </Modal>
    </>
  );
};
