import { Box, Typography } from "@mui/material";
import clsx from "clsx";
import { HTMLAttributes } from "react";

import { OntologyChip, parseUriForOntologyChip } from "../ontology-chip";

export const HashSelectorAutocompleteOption = ({
  liProps,
  description,
  title,
  $id,
}: {
  liProps: HTMLAttributes<HTMLLIElement>;
  description?: string;
  title: string;
  $id: string;
}) => {
  const ontology = parseUriForOntologyChip($id);

  return (
    <Box
      component="li"
      {...liProps}
      data-testid="property-selector-option"
      /** added "click-outside-ignore" to be able to use this selector with Grid component */
      className={clsx(liProps.className, "click-outside-ignore")}
      sx={{ my: 0.25 }}
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
    </Box>
  );
};
