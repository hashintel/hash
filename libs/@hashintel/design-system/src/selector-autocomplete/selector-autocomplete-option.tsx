import type {
  BaseUrl,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { Box, Paper, Popper, Stack, Tooltip, Typography } from "@mui/material";
import clsx from "clsx";
import type { HTMLAttributes, ReactElement } from "react";
import { useRef, useState } from "react";

import { Chip } from "../chip";
import { GRID_CLICK_IGNORE_CLASS } from "../constants";
import { EntityOrTypeIcon } from "../entity-or-type-icon";
import { FeatherRegularIcon } from "../icon-feather-regular";
import { ImageWithCheckedBackground } from "../image-with-checked-background";
import { OntologyChip } from "../ontology-chip";
import { parseUrlForOntologyChip } from "../parse-url-for-ontology-chip";

const descriptionPropertyKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/" as BaseUrl;

const fileUrlPropertyKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/" as BaseUrl;

const mimeTypePropertyKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/" as BaseUrl;

const imageThumbnailWidth = 90;

type TypeDisplayData = { $id: VersionedUrl; icon?: string; title: string };

export type SelectorAutocompleteOptionProps = {
  liProps: HTMLAttributes<HTMLLIElement> & { key?: string };
  description?: string;
  entityProperties?: PropertyObject;
  icon: string | ReactElement | null;
  title: string;
  types: [TypeDisplayData, ...TypeDisplayData[]];
  draft?: boolean;
};

export const SelectorAutocompleteOption = ({
  liProps,
  description,
  entityProperties,
  icon,
  title,
  types,
  draft = false,
}: SelectorAutocompleteOptionProps) => {
  const optionRef = useRef<HTMLLIElement>(null);
  const [showPreviewPane, setShowPreviewPane] = useState(false);

  const subtitle =
    description ??
    (entityProperties?.[descriptionPropertyKey] as string | undefined);

  const mimeType = entityProperties?.[mimeTypePropertyKey] as
    | string
    | undefined;

  const imageUrl = mimeType?.startsWith("image/")
    ? (entityProperties?.[fileUrlPropertyKey] as string | undefined)
    : undefined;

  const onMouseEnter = () => (imageUrl ? setShowPreviewPane(true) : null);
  const onMouseLeave = () => (imageUrl ? setShowPreviewPane(false) : null);

  const { key: _key, ...rest } = liProps;

  /** @todo H-1978 use the entity type's icon below rather than hardcoding EntityTypeIcon */

  return (
    <li
      {...rest}
      data-testid="selector-autocomplete-option"
      /** added GRID_CLICK_IGNORE_CLASS to be able to use this selector with Grid component */
      className={clsx(liProps.className, GRID_CLICK_IGNORE_CLASS)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={optionRef}
    >
      {!!imageUrl && (
        <Popper
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          open={showPreviewPane}
          anchorEl={optionRef.current}
          placement="right"
          sx={{
            borderRadius: 1,
            boxShadow: ({ boxShadows }) => boxShadows.lg,
            zIndex: ({ zIndex }) => zIndex.tooltip + 2,
          }}
        >
          <Paper sx={{ borderRadius: 1, padding: 2, width: 300 }}>
            <Stack
              sx={{
                borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
                pb: 1,
              }}
            >
              <ImageWithCheckedBackground
                alt={subtitle ?? title}
                src={imageUrl}
                sx={{ mb: 1 }}
              />
              <Typography
                sx={{
                  fontWeight: 500,
                  display: "block",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="smallTextLabels" mt={1.5}>
                  {subtitle}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" mt={1}>
              <Chip
                variant="outlined"
                icon={
                  typeof icon === "string" || !icon ? (
                    <EntityOrTypeIcon
                      entity={null}
                      fill={({ palette }) =>
                        entityProperties ? palette.gray[50] : palette.blue[70]
                      }
                      fontSize={12}
                      icon={icon}
                      /* @todo H-3363 set this using closed schema */
                      isLink={false}
                    />
                  ) : (
                    icon
                  )
                }
                label={types[0].title}
              />
            </Stack>
          </Paper>
        </Popper>
      )}
      <Stack direction="row" justifyContent="space-between" width="100%">
        <Stack
          spacing={0.8}
          width={
            imageUrl ? `calc(100% - ${imageThumbnailWidth + 10}px)` : "100%"
          }
        >
          <Box display="flex" alignItems="center" whiteSpace="nowrap">
            <Box
              component="span"
              display="flex"
              alignItems="center"
              maxWidth="60%"
            >
              <Stack
                direction="row"
                sx={({ palette }) => ({
                  alignItems: "center",
                  background: palette.gray[10],
                  border: `1px solid ${palette.gray[30]}`,
                  borderRadius: 4,
                  height: 26,
                  maxWidth: "100%",
                })}
              >
                <Box
                  sx={({ palette }) => ({
                    alignItems: "center",
                    background: "white",
                    borderRight: `1px solid ${palette.gray[30]}`,
                    borderRadius: 4,
                    display: "flex",
                    px: 1.2,
                    height: "100%",
                  })}
                >
                  {typeof icon === "string" || !icon ? (
                    <EntityOrTypeIcon
                      entity={null}
                      fill={({ palette }) =>
                        entityProperties ? palette.gray[50] : palette.blue[70]
                      }
                      fontSize={12}
                      icon={icon}
                      /* @todo H-3363 set this using closed schema */
                      isLink={false}
                    />
                  ) : (
                    icon
                  )}
                </Box>
                <Typography
                  variant="smallTextLabels"
                  sx={({ palette }) => ({
                    color: palette.black,
                    fontSize: 12,
                    fontWeight: 500,
                    px: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  })}
                >
                  {title}
                </Typography>
              </Stack>
            </Box>
            <Stack direction="row" gap={0.5} ml={2}>
              {types.map((type) => (
                <Tooltip title={type.$id} key={type.$id}>
                  {entityProperties ? (
                    <Stack
                      direction="row"
                      alignItems="center"
                      sx={{
                        fontSize: 12,
                        px: 1,
                        py: 0.5,
                        border: ({ palette }) =>
                          `1px solid ${palette.gray[30]}`,
                        borderRadius: 4,
                      }}
                    >
                      <EntityOrTypeIcon
                        entity={null}
                        icon={type.icon}
                        fontSize={12}
                        fill={({ palette }) => palette.blue[70]}
                        /* @todo H-3363 set this using closed schema */
                        isLink={false}
                        sx={{ mr: 0.8 }}
                      />
                      {type.title}
                    </Stack>
                  ) : (
                    <OntologyChip
                      {...parseUrlForOntologyChip(type.$id)}
                      sx={({ palette }) => ({
                        border: `1px solid ${palette.gray[30]}`,
                        flexShrink: 1,
                        minWidth: 150,
                        ml: 1.25,
                        mr: 2,
                      })}
                    />
                  )}
                </Tooltip>
              ))}
            </Stack>
            {draft ? (
              <Chip
                icon={<FeatherRegularIcon />}
                color="gray"
                label="Draft"
                sx={{
                  ml: 1,
                }}
              />
            ) : null}
          </Box>
          {subtitle && (
            <Typography
              component={Box}
              variant="microText"
              sx={(theme) => ({
                color: theme.palette.gray[50],
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
              })}
            >
              {subtitle}
            </Typography>
          )}
        </Stack>
        {imageUrl && (
          <Box
            sx={{
              borderRadius: 1,
              width: imageThumbnailWidth,
              display: "flex",
              height: 50,
              justifyContent: "center",
            }}
          >
            <Box
              component="img"
              alt={subtitle ?? ""}
              src={imageUrl}
              sx={{
                borderRadius: 1,
                height: "100%",
                objectFit: "contain",
                maxWidth: "100%",
              }}
            />
          </Box>
        )}
      </Stack>
    </li>
  );
};
