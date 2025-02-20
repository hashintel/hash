import type { EntityType } from "@blockprotocol/type-system/slim";
import { extractVersion } from "@blockprotocol/type-system/slim";
import {
  ArrowUpRightIcon,
  EntityTypeIcon,
  LinkTypeIcon,
} from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useEntityTypeFormContext } from "@hashintel/type-editor";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";
import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Controller } from "react-hook-form";

import { EditEmojiIconButton } from "../../../../shared/edit-emoji-icon-button";
import { Button, Link, Modal } from "../../../../shared/ui";
import { CopyableOntologyChip } from "../../copyable-ontology-chip";
import { CreateEntityTypeForm } from "../../create-entity-type-form";
import { EntityTypeDescription } from "../entity-type-description";
import { EntityTypeInverse } from "../entity-type-inverse";
import { EntityTypePlural } from "../entity-type-plural";

interface EntityTypeHeaderProps {
  currentVersion: number;
  entityTypeSchema: EntityType;
  hideOpenInNew?: boolean;
  isDraft: boolean;
  isLink: boolean;
  isPreviewSlide?: boolean;
  isReadonly: boolean;
  latestVersion?: number | null;
}

export const EntityTypeHeader = ({
  currentVersion,
  entityTypeSchema,
  hideOpenInNew,
  isDraft,
  isLink,
  isPreviewSlide,
  isReadonly,
  latestVersion,
}: EntityTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

  const isLatest =
    !latestVersion || extractVersion(entityTypeSchema.$id) === latestVersion;

  const latestVersionUrl = versionedUrlFromComponents(
    extractBaseUrl(entityTypeSchema.$id),
    latestVersion ?? 0,
  );

  const { control } = useEntityTypeFormContext<EntityTypeEditorFormData>();

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {/* <CopyableOntologyChip
            hideOpenInNew={hideOpenInNew}
            versionedUrl={versionedUrlFromComponents(
              extractBaseUrl(entityTypeSchema.$id),
              currentVersion,
            )}
          /> */}

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
          <Stack direction="row" alignItems="center" gap={5}>
            <Box display="flex" alignItems="center" mt={1} mb={3}>
              <Controller
                control={control}
                name="icon"
                render={({ field }) => {
                  const iconImgUrl = field.value?.startsWith("/")
                    ? new URL(field.value, window.location.origin).href
                    : field.value;

                  /**
                   * @todo allow uploading new SVG icons
                   */
                  if (iconImgUrl?.startsWith("http")) {
                    return (
                      <Box
                        sx={({ palette }) => ({
                          backgroundColor: palette.gray[50],
                          webkitMask: `url(${iconImgUrl}) no-repeat center / contain`,
                          mask: `url(${iconImgUrl}) no-repeat center / contain`,
                          width: 40,
                          height: 40,
                        })}
                      />
                    );
                  }

                  return (
                    <EditEmojiIconButton
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
                  );
                }}
              />
              <Typography variant="h1" fontWeight="bold" marginLeft={2}>
                {entityTypeSchema.title}
              </Typography>
            </Box>
            <Stack
              direction="row"
              alignItems="flex-start"
              gap={1}
              sx={{ position: "relative", top: 5 }}
            >
              <EntityTypePlural isLinkType={isLink} readonly={isReadonly} />
              {isLink && <EntityTypeInverse readonly={isReadonly} />}
            </Stack>
          </Stack>
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
      <Modal open={showExtendTypeModal} contentStyle={{ p: { xs: 0, md: 0 } }}>
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
              isLink={isLink}
              initialData={{ extendsEntityTypeId: entityTypeSchema.$id }}
              onCancel={() => setShowExtendTypeModal(false)}
            />
          </Box>
        </>
      </Modal>
    </>
  );
};
