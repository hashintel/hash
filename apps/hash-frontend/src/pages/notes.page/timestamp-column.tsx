import { IconButton } from "@hashintel/design-system";
import { Box } from "@mui/material";
import { FunctionComponent } from "react";

import { ArrowsFromLineRegularIcon } from "../../shared/icons/arrows-from-line-regular-icon";
import { ArrowsToLineRegularIcon } from "../../shared/icons/arrows-to-line-regular-icon";
import { ChevronDownRegularIcon } from "../../shared/icons/chevron-down-regular-icon";
import { ChevronUpRegularIcon } from "../../shared/icons/chevron-up-regular-icon";
import { TimestampCollectionHeading } from "./timestamp-collection-heading";
import { TimestampCollectionSubheading } from "./timestamp-collection-subheading";

const timestampColumnWidth = 150;

export const TimestampColumn: FunctionComponent<{
  heading?: string;
  subheading: string;
  navigateUp?: () => void;
  navigateDown?: () => void;
  isCollapsed: boolean;
  toggleIsCollapsed: () => void;
}> = ({
  heading,
  subheading,
  navigateUp,
  navigateDown,
  isCollapsed,
  toggleIsCollapsed,
}) => (
  <Box
    sx={{
      width: timestampColumnWidth,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
    }}
  >
    {heading ? (
      <TimestampCollectionHeading>{heading}</TimestampCollectionHeading>
    ) : null}
    <TimestampCollectionSubheading>{subheading}</TimestampCollectionSubheading>
    <Box display="flex" marginRight={-1}>
      <IconButton disabled={!navigateUp} onClick={navigateUp}>
        <ChevronUpRegularIcon />
      </IconButton>
      <IconButton disabled={!navigateDown} onClick={navigateDown}>
        <ChevronDownRegularIcon />
      </IconButton>
      <IconButton onClick={toggleIsCollapsed}>
        {isCollapsed ? (
          <ArrowsFromLineRegularIcon />
        ) : (
          <ArrowsToLineRegularIcon />
        )}
      </IconButton>
    </Box>
  </Box>
);
