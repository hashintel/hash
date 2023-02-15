import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import {
  getEntityTypeById,
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";

import { SectionWrapper } from "../../../shared/section-wrapper";
import { LinksSectionEmptyState } from "../shared/links-section-empty-state";
import { useEntityEditor } from "./entity-editor-context";
import { LinkTable } from "./links-section/link-table";

export const LinksSection = () => {
  const { entitySubgraph } = useEntityEditor();
  const [showSearch, setShowSearch] = useState(false);

  const entity = getRoots(entitySubgraph)[0]!;
  const entityType = getEntityTypeById(
    entitySubgraph,
    entity.metadata.entityTypeId,
  );

  const outgoingLinks = getOutgoingLinksForEntity(
    entitySubgraph,
    entity.metadata.recordId.entityId,
    entity.metadata.temporalVersioning[
      entitySubgraph.temporalAxes.resolved.variable.axis
    ],
  );

  const isEmpty = Object.keys(entityType?.schema.links ?? {}).length === 0;

  if (isEmpty) {
    return <LinksSectionEmptyState />;
  }

  return (
    <SectionWrapper
      title="Links"
      titleTooltip="The links on an entity are determined by its type. To add a new link to this entity, specify an additional type or edit an existing one."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip size="xs" label={`${outgoingLinks.length} links`} />
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
        <LinkTable
          onSearchClose={() => setShowSearch(false)}
          showSearch={showSearch}
        />
      </Paper>
    </SectionWrapper>
  );
};
