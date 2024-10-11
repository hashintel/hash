import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityProperties } from "@local/hash-graph-types/entity";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { Paper, Stack } from "@mui/material";
import { useState } from "react";

import { Grid } from "../../../../../../components/grid/grid";
import { renderChipCell } from "../../../../../shared/chip-cell";
import { SectionWrapper } from "../../../../shared/section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { useEntityEditor } from "../entity-editor-context";
import { renderSummaryChipCell } from "../shared/summary-chip-cell";
import { renderLinkCell } from "./outgoing-links-section/cells/link-cell";
import { renderLinkedWithCell } from "./outgoing-links-section/cells/linked-with-cell";
import { linkGridColumns } from "./outgoing-links-section/constants";
import { OutgoingLinksTable } from "./outgoing-links-section/readonly-outgoing-links-table";
import { useCreateGetCellContent } from "./outgoing-links-section/use-create-get-cell-content";
import { useRows } from "./outgoing-links-section/use-rows";

interface OutgoingLinksSectionPropsProps {
  isLinkEntity: boolean;
  outgoingLinks: Entity<EntityProperties>[];
}

export const OutgoingLinksSection = ({
  isLinkEntity,
  outgoingLinks,
}: OutgoingLinksSectionPropsProps) => {
  const [showSearch, setShowSearch] = useState(false);

  const { entitySubgraph, readonly } = useEntityEditor();

  const rows = useRows();
  const createGetCellContent = useCreateGetCellContent();

  if (outgoingLinks.length === 0 && isLinkEntity) {
    /**
     * We don't show the links tables for link entities unless they have some links already set,
     * because we don't yet fully support linking to/from links in the UI.
     * If they happen to have ended up with some via a different client / process, we show them.
     */
    return null;
  }

  const entity = getRoots(entitySubgraph)[0]!;

  const outgoingLinksAndTargets = readonly
    ? getOutgoingLinkAndTargetEntities(
        entitySubgraph,
        entity.metadata.recordId.entityId,
        entity.metadata.temporalVersioning[
          entitySubgraph.temporalAxes.resolved.variable.axis
        ],
      )
    : null;

  if (
    rows.length === 0 ||
    (readonly && outgoingLinksAndTargets?.length === 0)
  ) {
    return <LinksSectionEmptyState direction="Outgoing" />;
  }

  return (
    <SectionWrapper
      title="Outgoing Links"
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
      {readonly ? (
        <OutgoingLinksTable
          outgoingLinksAndTargets={outgoingLinksAndTargets!}
        />
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          <Grid
            columns={linkGridColumns}
            rows={rows}
            createGetCellContent={createGetCellContent}
            dataLoading={false}
            showSearch={showSearch}
            onSearchClose={() => setShowSearch(false)}
            // define max height if there are lots of rows
            height={rows.length > 10 ? 500 : undefined}
            customRenderers={[
              renderLinkCell,
              renderLinkedWithCell,
              renderSummaryChipCell,
              renderChipCell,
            ]}
          />
        </Paper>
      )}
    </SectionWrapper>
  );
};
