import type {
  EntityType,
  OntologyTypeVersion,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  ArrowUpRightIcon,
  EntityTypeIcon,
  LinkTypeIcon,
} from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useEntityTypeFormContext } from "@hashintel/type-editor";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { Controller } from "react-hook-form";

import { EditEmojiIconButton } from "../../../../shared/edit-emoji-icon-button";
import { generateLinkParameters } from "../../../../shared/generate-link-parameters";
import { Button, Link, Modal } from "../../../../shared/ui";
import { CopyableOntologyChip } from "../../copyable-ontology-chip";
import { CreateEntityTypeForm } from "../../create-entity-type-form";
import { useSlideStack } from "../../slide-stack";
import { useTextSize } from "../../use-text-size";
import { EntityTypeDescription } from "../entity-type-description";
import { EntityTypeInverse } from "../entity-type-inverse";
import { EntityTypePlural } from "../entity-type-plural";

interface EntityTypeHeaderProps {
  currentVersion: OntologyTypeVersion;
  entityTypeSchema: EntityType;
  isArchived: boolean;
  isDraft: boolean;
  isLink: boolean;
  isInSlide?: boolean;
  isReadonly: boolean;
  latestVersion?: OntologyTypeVersion | null;
}

export const EntityTypeHeader = ({
  currentVersion,
  entityTypeSchema,
  isArchived,
  isDraft,
  isLink,
  isInSlide,
  isReadonly,
  latestVersion,
}: EntityTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

  const isLatest =
    !latestVersion || extractVersion(entityTypeSchema.$id) === latestVersion;

  const latestVersionUrl = versionedUrlFromComponents(
    extractBaseUrl(entityTypeSchema.$id),
    latestVersion ?? makeOntologyTypeVersion({ major: 0 }),
  );

  const { control } = useEntityTypeFormContext<EntityTypeEditorFormData>();

  const { slideContainerRef, pushToSlideStack } = useSlideStack();

  const entityTypeNameTextRef = useRef<HTMLHeadingElement | null>(null);

  const entityTypeNameSize = useTextSize(entityTypeNameTextRef);

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {!isLatest && (
            <Link
              href={latestVersionUrl}
              onClick={(event) => {
                if (isInSlide) {
                  event.preventDefault();
                  pushToSlideStack({
                    kind: "entityType",
                    itemId: latestVersionUrl,
                  });
                }
              }}
              sx={{
                textDecoration: "none",
              }}
            >
              <Typography
                color="inherit"
                sx={{ fontSize: 11, fontWeight: 600 }}
              >
                {`v${currentVersion.toString()} –> v${latestVersion.toString()} available`}
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
            <Stack direction="row" alignItems="flex-start" mt={1} mb={3}>
              {entityTypeNameSize !== null && (
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
                            position: "relative",
                            top: entityTypeNameSize.lineHeight / 2 - 20,
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
                        sx={{
                          position: "relative",
                          top: entityTypeNameSize.lineHeight / 2 - 22,
                        }}
                      />
                    );
                  }}
                />
              )}
              <Box sx={{ position: "relative", ml: 2.5 }}>
                <Tooltip
                  placement="top-start"
                  componentsProps={{
                    popper: {
                      container: slideContainerRef?.current,
                    },
                    tooltip: {
                      sx: {
                        background: "transparent",
                        marginBottom: "5px !important",
                        maxWidth: "unset",
                        p: 0,
                      },
                    },
                  }}
                  title={
                    <CopyableOntologyChip
                      hideOpenInNew
                      versionedUrl={versionedUrlFromComponents(
                        extractBaseUrl(entityTypeSchema.$id),
                        currentVersion,
                      )}
                    />
                  }
                >
                  <Typography
                    variant="h1"
                    fontWeight="bold"
                    ref={entityTypeNameTextRef}
                    sx={{
                      lineHeight: 1.2,
                    }}
                  >
                    {entityTypeSchema.title}
                  </Typography>
                </Tooltip>
                {isInSlide && entityTypeNameSize !== null && (
                  <Link
                    href={generateLinkParameters(entityTypeSchema.$id).href}
                    sx={{
                      position: "absolute",
                      left: entityTypeNameSize.lastLineWidth + 20,
                      /**
                       * The vertical center of the text plus offset half the icon size
                       */
                      top:
                        entityTypeNameSize.lastLineTop +
                        (entityTypeNameSize.lineHeight / 2 - 12),
                    }}
                    target="_blank"
                  >
                    <ArrowUpRightFromSquareRegularIcon
                      sx={{
                        fill: ({ palette }) => palette.blue[50],
                        fontSize: 24,
                        "&:hover": {
                          fill: ({ palette }) => palette.blue[70],
                        },
                      }}
                    />
                  </Link>
                )}
              </Box>
            </Stack>
            <Stack
              direction="column"
              alignItems="flex-start"
              gap={1.5}
              sx={{ position: "relative", top: 5 }}
            >
              <EntityTypePlural isLinkType={isLink} readonly={isReadonly} />
              {isLink && <EntityTypeInverse readonly={isReadonly} />}
            </Stack>
          </Stack>
          {!isDraft && !isArchived ? (
            <Button
              onClick={() => setShowExtendTypeModal(true)}
              variant="secondary"
              size="small"
            >
              Extend <ArrowUpRightIcon sx={{ fontSize: 16, ml: 1.5 }} />
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ mb: 3 }}>
          <EntityTypeDescription readonly={isReadonly} />
        </Box>
      </Box>
      <Modal
        open={showExtendTypeModal}
        contentStyle={{ p: { xs: 0, md: 0 }, maxWidth: 500 }}
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
