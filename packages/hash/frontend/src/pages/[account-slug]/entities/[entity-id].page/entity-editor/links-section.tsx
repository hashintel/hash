import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  IconButton,
  Chip,
} from "@hashintel/hash-design-system";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";
import { LinksIcon } from "../../../../../shared/icons";
import { useEntityEditor } from "./entity-editor-context";
import { LinkTable } from "./links-section/link-table";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { SectionEmptyState } from "../../../shared/section-empty-state";

const EmptyState = () => (
  <SectionEmptyState
    title="This entity currently has no links"
    titleIcon={<LinksIcon />}
    description="Links contain information about connections or relationships between different entities"
  />
);

export const LinksSection = () => {
  const { rootEntityAndSubgraph } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  if (!rootEntityAndSubgraph) {
    return null;
  }

  const entity = rootEntityAndSubgraph.root;

  const isEmpty = !entity.links.length;

  return (
    <SectionWrapper
      title="Links"
      titleTooltip={
        isEmpty
          ? ""
          : "The links on an entity are determined by its type. To add a new link to this entity, specify an additional type or edit an existing one."
      }
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
    </SectionWrapper>
  );
};
