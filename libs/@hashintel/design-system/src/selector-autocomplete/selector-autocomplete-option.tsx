import { Box, Typography } from "@mui/material";
import clsx from "clsx";
import { HTMLAttributes } from "react";

import { GRID_CLICK_IGNORE_CLASS } from "../constants";
import { OntologyChip, parseUrlForOntologyChip } from "../ontology-chip";

export const SelectorAutocompleteOption = ({
  liProps,
  description,
  title,
  typeId,
}: {
  liProps: HTMLAttributes<HTMLLIElement>;
  description?: string;
  title: string;
  typeId: string;
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
          mb={0.5}
          whiteSpace="nowrap"
        >
          <Box
            component="span"
            flexShrink={0}
            display="flex"
            alignItems="center"
          >
            <Typography
              variant="smallTextLabels"
              fontWeight={500}
              mr={0.5}
              color="black"
            >
              {title}
            </Typography>
          </Box>
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
            sx={{ flexShrink: 1, ml: 1.25, mr: 2 }}
          />
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
