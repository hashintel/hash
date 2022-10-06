import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "@hashintel/hash-design-system/chip";
import { FontAwesomeIcon } from "@hashintel/hash-design-system/fontawesome-icon";
import { IconButton } from "@hashintel/hash-design-system/icon-button";
import { Stack } from "@mui/material";
import { FilterListIcon } from "../../../../shared/icons";
import { PropertyTable } from "./property-table";
import { EntitySection } from "./shared/entity-section";
import { WhiteChip } from "./shared/white-chip";

export const PropertiesSection = () => {
  return (
    <EntitySection
      title="Properties"
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label="8 Values" />
          <WhiteChip size="xs" label="112 empty" />
          <Stack direction="row" spacing={0.5}>
            <IconButton
              rounded
              onClick={() => alert("search")}
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
      <PropertyTable />
    </EntitySection>
  );
};
