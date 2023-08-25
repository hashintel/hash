import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { Box, Stack, SvgIconProps, Tooltip, Typography } from "@mui/material";
import clsx from "clsx";
import { FunctionComponent, HTMLAttributes } from "react";

import { GRID_CLICK_IGNORE_CLASS } from "../constants";
import { OntologyChip, parseUrlForOntologyChip } from "../ontology-chip";

export const SelectorAutocompleteOption = ({
  liProps,
  description,
  Icon,
  title,
  typeId,
}: {
  liProps: HTMLAttributes<HTMLLIElement>;
  description?: string;
  Icon: FunctionComponent<SvgIconProps> | null;
  title: string;
  typeId: VersionedUrl;
}) => {
  const ontology = parseUrlForOntologyChip(typeId);

  return (
    <li
      {...liProps}
      data-testid="property-selector-option"
      /** added GRID_CLICK_IGNORE_CLASS to be able to use this selector with Grid component */
      className={clsx(liProps.className, GRID_CLICK_IGNORE_CLASS)}
    >
      <Box width="100%">
        <Box
          width="100%"
          display="flex"
          alignItems="center"
          mb={0.8}
          whiteSpace="nowrap"
        >
          <Box
            component="span"
            flexShrink={0}
            display="flex"
            alignItems="center"
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
                  })}
                >
                  {title}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="smallTextLabels" fontWeight={500} mr={0.5}>
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
            width: "100%",
          })}
        >
          {description}
        </Typography>
      </Box>
    </li>
  );
};
