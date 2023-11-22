import { EntityType, extractVersion } from "@blockprotocol/type-system/slim";
import {
  ArrowUpRightIcon,
  EntityTypeIcon,
  LinkTypeIcon,
} from "@hashintel/design-system";
import { useEntityTypeFormContext } from "@hashintel/type-editor";
import { Box, Stack, Typography } from "@mui/material";
import { ReactNode, useState } from "react";
import { Controller } from "react-hook-form";

import { Button, Link, Modal } from "../../../../shared/ui";
import { CreateEntityTypeForm } from "../../create-entity-type-form";
import { EditIconButton } from "../../edit-icon-button";
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

  const { control } = useEntityTypeFormContext();

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
          <Box display="flex" alignItems="flex-end" my={3}>
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <EditIconButton
                  icon={field.value}
                  disabled={isReadonly}
                  onChange={(updatedIcon) => field.onChange(updatedIcon)}
                  defaultIcon={
                    isLink ? (
                      <LinkTypeIcon
                        sx={({ palette }) => ({
                          stroke: palette.gray[50],
                        })}
                      />
                    ) : (
                      <EntityTypeIcon
                        sx={({ palette }) => ({
                          fill: palette.gray[50],
                        })}
                      />
                    )
                  }
                />
              )}
            />
            <Typography variant="h1" fontWeight="bold" marginLeft={3}>
              {entityType.title}
            </Typography>
          </Box>
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
