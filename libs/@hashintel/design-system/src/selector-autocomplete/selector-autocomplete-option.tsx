import { BaseUrl, EntityPropertiesObject } from "@blockprotocol/graph";
import { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  Box,
  Paper,
  Popper,
  Stack,
  SvgIconProps,
  Tooltip,
  Typography,
} from "@mui/material";
import clsx from "clsx";
import { FunctionComponent, HTMLAttributes, useRef, useState } from "react";

import { GRID_CLICK_IGNORE_CLASS } from "../constants";
import { OntologyChip, parseUrlForOntologyChip } from "../ontology-chip";

const descriptionPropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";

const fileUrlPropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

const mimeTypePropertyKey: BaseUrl =
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/";

export type SelectorAutocompleteOptionProps = {
  liProps: HTMLAttributes<HTMLLIElement>;
  description?: string;
  entityProperties?: EntityPropertiesObject;
  Icon: FunctionComponent<SvgIconProps> | null;
  title: string;
  /** the typeId associated with this entity type or entity, displayed as a chip in the option */
  typeId: VersionedUrl;
};

export const SelectorAutocompleteOption = ({
  liProps,
  description,
  entityProperties,
  Icon,
  title,
  typeId,
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

  return (
    <li
      {...liProps}
      data-testid="property-selector-option"
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
            <Stack>
              <Box
                alt={subtitle}
                component="img"
                src={imageUrl}
                sx={({ palette }) => ({
                  backgroundImage: `linear-gradient(45deg, ${palette.gray[20]} 25%, transparent 25%), linear-gradient(-45deg, ${palette.gray[20]} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${palette.gray[20]} 75%), linear-gradient(-45deg, transparent 75%, ${palette.gray[20]} 75%)`,
                  backgroundSize: "20px 20px",
                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  objectFit: "contain",
                  width: "100%",
                  mb: 2,
                })}
              />
              <Typography sx={{ fontWeight: 500, mb: 1 }}>{title}</Typography>
              <Typography variant="smallTextLabels">{subtitle}</Typography>
            </Stack>
          </Paper>
        </Popper>
      )}
      <Stack direction="row" justifyContent="space-between" width="100%">
        <Stack spacing={0.8} width={imageUrl ? `calc(100% - 65px)` : "100%"}>
          <Box display="flex" alignItems="center" whiteSpace="nowrap">
            <Box
              component="span"
              display="flex"
              alignItems="center"
              maxWidth="50%"
            >
              {Icon ? (
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
                    })}
                  >
                    <Icon sx={{ fontSize: 14 }} />
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
              <OntologyChip
                {...ontology}
                path={
                  <Typography
                    component="span"
                    fontWeight="bold"
                    color={(theme) => theme.palette.blue[70]}
                  >
                    {ontology.path}
                  </Typography>
                }
                sx={({ palette }) => ({
                  border: `1px solid ${palette.gray[30]}`,
                  flexShrink: 1,
                  minWidth: 150,
                  ml: 1.25,
                  mr: 2,
                })}
              />
            </Tooltip>
          </Box>
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
        </Stack>
        {imageUrl && (
          <Box
            component="img"
            alt={subtitle ?? ""}
            src={imageUrl}
            sx={{ height: 50, objectFit: "contain" }}
          />
        )}
      </Stack>
    </li>
  );
};
