import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Chip } from "@hashintel/hash-design-system/chip";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";
import { LinksIcon } from "../../../../../shared/icons";
import { useEntityEditor } from "./entity-editor-context";
import { LinkTable } from "./links-section/link-table";
import { EntitySection } from "./shared/entity-section";
import { EntitySectionEmptyState } from "./shared/entity-section-empty-state";

const EmptyState = () => (
  <EntitySectionEmptyState
    title="This entity currently has no links"
    titleIcon={<LinksIcon />}
    description="Links contain information about connections or relationships between
different entities"
  />
);

export const LinksSection = () => {
  const { entityRootedSubgraph } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  if (!entityRootedSubgraph) {
    return null;
  }

  const entity = entityRootedSubgraph.root;

  const isEmpty = !entity.links.length;

  return (
    <EntitySection
      title="Links"
      titleStartContent={
        isEmpty ? (
          <Chip label="No links" />
        ) : (
          <Stack direction="row" spacing={1.5}>
            <Chip size="xs" label={`${entity.links.length} links`} />
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
          <LinkTable
            onSearchClose={() => setShowSearch(false)}
            showSearch={showSearch}
          />
        </Paper>
      )}
    </EntitySection>
  );
};
