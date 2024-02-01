import { BaseUrl, EntityPropertiesObject } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Box, Paper, Popper, Stack, Tooltip, Typography } from "@mui/material";
import clsx from "clsx";
import { HTMLAttributes, ReactNode, useRef, useState } from "react";

import { Chip } from "../chip";
import { GRID_CLICK_IGNORE_CLASS } from "../constants";
import { FeatherRegularIcon } from "../icon-feather-regular";
import { ImageWithCheckedBackground } from "../image-with-checked-background";
import { OntologyChip } from "../ontology-chip";
import { EntityTypeIcon } from "../ontology-icons";
import { parseUrlForOntologyChip } from "../parse-url-for-ontology-chip";

const descriptionPropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";

const fileUrlPropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

const mimeTypePropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/";

const imageThumbnailWidth = 90;

export type SelectorAutocompleteOptionProps = {
  liProps: HTMLAttributes<HTMLLIElement>;
  description?: string;
  entityProperties?: EntityPropertiesObject;
  icon: ReactNode | null;
  title: string;
  /** the typeId associated with this entity type or entity, displayed as a chip in the option */
  typeId: VersionedUrl;
  draft?: boolean;
};

// This assumes a hash.ai/blockprotocol.org type URL format ending in [slugified-title]/v/[number]
const slugToTitleCase = (slug?: string) =>
  slug
    ? slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : undefined;

export const SelectorAutocompleteOption = ({
  liProps,
  description,
  entityProperties,
  icon,
  title,
  typeId,
  draft = false,
}: SelectorAutocompleteOptionProps) => {
  const ontology = parseUrlForOntologyChip(typeId);

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

  const typeTitle = slugToTitleCase(typeId.split("/").slice(-3, -2)[0]);

  return (
    <li
      {...liProps}
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
              <Typography sx={{ fontWeight: 500 }}>{title}</Typography>
              {subtitle && (
                <Typography variant="smallTextLabels" mt={1.5}>
                  {subtitle}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" mt={1}>
              <Chip color="gray" icon={<EntityTypeIcon />} label={typeTitle} />
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
              maxWidth="50%"
            >
              {icon ? (
                <Stack
                  direction="row"
                  sx={({ palette }) => ({
                    alignItems: "center",
                    background: palette.gray[10],
                    border: `1px solid ${palette.gray[30]}`,
                    borderRadius: 4,
                    height: 26,
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
                      fontSize: 14,
                      "> svg": {
                        fontSize: 14,
                      },
                    })}
                  >
                    {icon}
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
              ) : (
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    mr: 0.5,
                    fontWeight: 500,
                  }}
                >
                  {title}
                </Typography>
              )}
            </Box>
            <Tooltip title={typeId}>
              {entityProperties && typeTitle ? (
                <Chip
                  icon={<EntityTypeIcon />}
                  color="gray"
                  label={typeTitle}
                  sx={{
                    ml: 1,
                  }}
                />
              ) : (
                <OntologyChip
                  {...ontology}
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
