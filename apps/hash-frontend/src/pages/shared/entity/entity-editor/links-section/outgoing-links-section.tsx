import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";
import type { Entity } from "@blockprotocol/type-system";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import { Paper, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import type { SortGridRows } from "../../../../../components/grid/grid";
import { Grid } from "../../../../../components/grid/grid";
import { createRenderChipCell } from "../../../chip-cell";
import { SectionWrapper } from "../../../section-wrapper";
import { LinksSectionEmptyState } from "../../shared/links-section-empty-state";
import { useEntityEditor } from "../entity-editor-context";
import { renderSummaryChipCell } from "../shared/summary-chip-cell";
import { renderLinkCell } from "./outgoing-links-section/cells/link-cell";
import { renderLinkedWithCell } from "./outgoing-links-section/cells/linked-with-cell";
import { linkGridColumns } from "./outgoing-links-section/constants";
import { OutgoingLinksTable } from "./outgoing-links-section/readonly-outgoing-links-table";
import type {
  LinkColumn,
  LinkColumnKey,
  LinkRow,
} from "./outgoing-links-section/types";
import { useCreateGetCellContent } from "./outgoing-links-section/use-create-get-cell-content";
import { useRows } from "./outgoing-links-section/use-rows";

interface OutgoingLinksSectionPropsProps {
  isLinkEntity: boolean;
  outgoingLinks: Entity[];
}

export const OutgoingLinksSection = ({
  isLinkEntity,
  outgoingLinks,
}: OutgoingLinksSectionPropsProps) => {
  const [showSearch, setShowSearch] = useState(false);

  const { entitySubgraph, entity, readonly } = useEntityEditor();

  const rows = useRows();
  const createGetCellContent = useCreateGetCellContent();

  const sortRows = useCallback<
    SortGridRows<LinkRow, LinkColumn, LinkColumnKey>
  >((unsortedRows, sort) => {
    const { columnKey, direction } = sort;

    return unsortedRows.toSorted((a, b) => {
      let firstString = "";
      let secondString = "";

      if (columnKey === "linkTitle") {
        firstString = a.linkTitle;
        secondString = b.linkTitle;
      } else if (columnKey === "linkedWith") {
        firstString = a.linkAndTargetEntities[0]?.rightEntityLabel ?? "";
        secondString = b.linkAndTargetEntities[0]?.rightEntityLabel ?? "";
      } else {
        firstString = a.expectedEntityTypes[0]?.title ?? "";
        secondString = b.expectedEntityTypes[0]?.title ?? "";
      }

      const comparison = firstString.localeCompare(secondString);

      return direction === "asc" ? comparison : -comparison;
    });
  }, []);

  if (outgoingLinks.length === 0 && isLinkEntity) {
    /**
     * We don't show the links tables for link entities unless they have some links already set,
     * because we don't yet fully support linking to/from links in the UI.
     * If they happen to have ended up with some via a different client / process, we show them.
     */
    return null;
  }

  /** @todo revert 'true' to 'readonly' before merging (for testing / demo only) */
  const outgoingLinksAndTargets = true
    ? getOutgoingLinkAndTargetEntities(
        entitySubgraph,
        entity.metadata.recordId.entityId,
        entity.metadata.temporalVersioning[
          entitySubgraph.temporalAxes.resolved.variable.axis
        ],
      )
    : null;

  return (
    <SectionWrapper
      title="Outgoing Links"
      titleTooltip="The links on an entity are determined by its type. To add a new link to this entity, specify an additional type or edit an existing one."
      titleStartContent={
        <Stack direction="row" spacing={1.5}>
          <Chip
            size="xs"
            label={`${outgoingLinks.length} ${outgoingLinks.length === 1 ? "link" : "links"}`}
          />
          {!!rows.length && (
            <Stack direction="row" spacing={0.5}>
              <IconButton
                rounded
                onClick={() => setShowSearch(true)}
                sx={{ color: ({ palette }) => palette.gray[60] }}
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
              </IconButton>
            </Stack>
          )}
        </Stack>
      }
    >
      {/** @todo revert '!true' to '!readonly' before merging (for testing / demo only) */}
      {rows.length && !true ? (
        <Paper sx={{ overflow: "hidden" }}>
          <Grid
            columns={linkGridColumns}
            createGetCellContent={createGetCellContent}
            customRenderers={[
              renderLinkCell,
              renderLinkedWithCell,
              renderSummaryChipCell,
              createRenderChipCell(),
            ]}
            dataLoading={false}
            height={rows.length > 10 ? 500 : undefined}
            rows={rows}
            onSearchClose={() => setShowSearch(false)}
            showSearch={showSearch}
            sortableColumns={["linkTitle", "linkedWith", "expectedEntityTypes"]}
            sortRows={sortRows}
          />
        </Paper>
      ) : outgoingLinksAndTargets?.length ? (
        <OutgoingLinksTable outgoingLinksAndTargets={outgoingLinksAndTargets} />
      ) : (
        <LinksSectionEmptyState direction="Outgoing" />
      )}
    </SectionWrapper>
  );
};
