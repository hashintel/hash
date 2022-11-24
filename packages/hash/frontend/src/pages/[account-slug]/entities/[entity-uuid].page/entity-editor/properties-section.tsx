import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import {
  Chip,
  FontAwesomeIcon,
  IconButton,
} from "@hashintel/hash-design-system";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { LinksIcon } from "../../../../../shared/icons";
import { useEntityEditor } from "./entity-editor-context";
import { getPropertyCountSummary } from "./properties-section/get-property-count-summary";
import { PropertyTable } from "./properties-section/property-table";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { SectionEmptyState } from "../../../shared/section-empty-state";
import { WhiteChip } from "../../../shared/white-chip";

const EmptyState = () => (
  <SectionEmptyState
    title="This entity currently has no properties"
    titleIcon={<LinksIcon />}
    description="Properties contain data about entities, and are inherited from types"
  />
);

export const PropertiesSection = () => {
  const { entitySubgraph } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  if (!entitySubgraph) {
    return null;
  }

  const entity = getRoots(entitySubgraph)[0]!;

  const { emptyCount, notEmptyCount } = getPropertyCountSummary(
    entity.properties,
  );

  const isEmpty = emptyCount + notEmptyCount === 0;

  return (
    <SectionWrapper
      title="Properties"
      titleTooltip={
        isEmpty
          ? ""
          : "The properties on an entity are determined by its type. To add a new property to this entity, specify an additional type or edit an existing one."
      }
      titleStartContent={
        isEmpty ? (
          <Chip label="No properties" />
        ) : (
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
        )
      }
    >
      {isEmpty ? (
        <EmptyState />
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          <PropertyTable
            onSearchClose={() => setShowSearch(false)}
            showSearch={showSearch}
          />
        </Paper>
      )}
    </SectionWrapper>
  );
};
