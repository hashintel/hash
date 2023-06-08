import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";

import { SectionWrapper } from "../../../shared/section-wrapper";
import { WhiteChip } from "../../../shared/white-chip";
import { PropertiesSectionEmptyState } from "../shared/properties-section-empty-state";
import { getPropertyCountSummary } from "./properties-section/get-property-count-summary";
import { PropertyTable } from "./properties-section/property-table";
import { useRows } from "./properties-section/property-table/use-rows";

export const PropertiesSection = () => {
  const [showSearch, setShowSearch] = useState(false);

  const [rows] = useRows();

  const { emptyCount, notEmptyCount, totalCount } =
    getPropertyCountSummary(rows);

  if (!totalCount) {
    return <PropertiesSectionEmptyState />;
  }

  return (
    <SectionWrapper
      title="Properties"
      titleTooltip="The properties on an entity are determined by its type. To add a new property to this entity, specify an additional type or edit an existing one."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          {notEmptyCount > 0 && (
            <Chip size="xs" label={`${notEmptyCount} values`} />
          )}
          {emptyCount > 0 && (
            <WhiteChip size="xs" label={`${emptyCount} empty`} />
          )}
          <Stack direction="row" spacing={0.5}>
            <IconButton
              rounded
              onClick={() => setShowSearch(true)}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </IconButton>
          </Stack>
        </Stack>
      }
    >
      <Paper sx={{ overflow: "hidden" }}>
        <PropertyTable
          onSearchClose={() => setShowSearch(false)}
          showSearch={showSearch}
        />
      </Paper>
    </SectionWrapper>
  );
};
