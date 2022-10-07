import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";
import { FilterListIcon } from "../../../../shared/icons";
import { useEntityEditor } from "./entity-editor-context";
import { PropertyTable } from "./property-table";
import { EntitySection } from "./shared/entity-section";
// import { WhiteChip } from "./shared/white-chip";

export const PropertiesSection = () => {
  const { entity } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  if (!entity) return null;

  const propertyCount = Object.keys(entity.properties).length;

  return (
    <EntitySection
      title="Properties"
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label={`${propertyCount} Values`} />
          {/* <WhiteChip size="xs" label="112 empty" /> */}
          <Stack direction="row" spacing={0.5}>
            <IconButton
              rounded
              onClick={() => setShowSearch(true)}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </IconButton>
            <IconButton
              rounded
              onClick={() => alert("filter")}
              sx={{ color: ({ palette }) => palette.gray[60] }}
            >
              <FilterListIcon />
            </IconButton>
          </Stack>
        </Stack>
      }
    >
      <Paper sx={{ overflow: "hidden" }}>
        <PropertyTable
          entity={entity}
          onSearchClose={() => setShowSearch(false)}
          showSearch={showSearch}
        />
      </Paper>
    </EntitySection>
  );
};
