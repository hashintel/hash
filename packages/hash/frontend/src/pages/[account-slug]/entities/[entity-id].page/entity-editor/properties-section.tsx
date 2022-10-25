import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";
import { useEntityEditor } from "./entity-editor-context";
import { getEmptyPropertyCount } from "./properties-section/get-empty-property-count";
import { PropertyTable } from "./properties-section/property-table";
import { EntitySection } from "./shared/entity-section";
import { WhiteChip } from "./shared/white-chip";

export const PropertiesSection = () => {
  const { entity } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  if (!entity) {
    return null;
  }

  const propertyCount = Object.keys(entity.properties).length;
  const emptyPropertyCount = getEmptyPropertyCount(entity.properties);

  return (
    <EntitySection
      title="Properties"
      titleTooltip="The properties on an entity are determined by its type. To add a new property to this entity, specify an additional type or edit an existing one."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label={`${propertyCount} Values`} />
          {emptyPropertyCount > 0 && (
            <WhiteChip size="xs" label={`${emptyPropertyCount} empty`} />
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
    </EntitySection>
  );
};
