import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { Box, CircularProgress, Paper, Stack } from "@mui/material";
import { useCallback, useState } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
} from "@blockprotocol/graph/stdlib";
import { Chip, FontAwesomeIcon, IconButton } from "@hashintel/design-system";

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
import { useCreateGetCellContent } from "./outgoing-links-section/use-create-get-cell-content";
import { useRows } from "./outgoing-links-section/use-rows";
import { useEntityLinks } from "./use-entity-links";

import type { SortGridRows } from "../../../../../components/grid/grid";
import type {
  LinkColumn,
  LinkColumnKey,
  LinkRow,
} from "./outgoing-links-section/types";

export const OutgoingLinksSection = ({
  isLinkEntity,
}: {
  isLinkEntity: boolean;
}) => {
  const [showSearch, setShowSearch] = useState(false);

  const {
    closedMultiEntityTypesDefinitions: editorDefinitions,
    draftLinksToArchive,
    entity,
    entitySubgraph: editorSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: editorTypesMap,
    readonly,
    selfFetchLinks,
  } = useEntityEditor();

  /**
   * When the entity is readonly we fetch the link data here, so that it does not
   * need to be part of the main entity query. When editable, the link data is
   * part of the editor subgraph (so adding/removing/saving links is unchanged).
   */
  const {
    loading,
    linksSubgraph,
    linkAndDestinationEntitiesClosedMultiEntityTypesMap: fetchedTypesMap,
    closedMultiEntityTypesDefinitions: fetchedDefinitions,
  } = useEntityLinks({
    direction: "outgoing",
    entityId: entity.metadata.recordId.entityId,
    skip: !selfFetchLinks,
  });

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

  if (selfFetchLinks && (loading || !linksSubgraph || !fetchedDefinitions)) {
    return (
      <SectionWrapper title="Outgoing Links">
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      </SectionWrapper>
    );
  }

  const entitySubgraph = selfFetchLinks ? linksSubgraph! : editorSubgraph;
  const closedMultiEntityTypesMap = selfFetchLinks
    ? (fetchedTypesMap ?? null)
    : editorTypesMap;
  const closedMultiEntityTypesDefinitions = selfFetchLinks
    ? fetchedDefinitions!
    : editorDefinitions;

  const outgoingLinks = getOutgoingLinksForEntity(
    entitySubgraph,
    entity.metadata.recordId.entityId,
    entity.metadata.temporalVersioning[
      entitySubgraph.temporalAxes.resolved.variable.axis
    ],
  ).filter(
    (outgoingLink) => !draftLinksToArchive.includes(outgoingLink.entityId),
  );

  if (outgoingLinks.length === 0 && isLinkEntity) {
    /**
     * We don't show the links tables for link entities unless they have some links already set,
     * because we don't yet fully support linking to/from links in the UI.
     * If they happen to have ended up with some via a different client / process, we show them.
     */
    return null;
  }

  const outgoingLinksAndTargets = readonly
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
            label={`${outgoingLinks.length} ${
              outgoingLinks.length === 1 ? "link" : "links"
            }`}
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
      {rows.length && !readonly ? (
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
        <OutgoingLinksTable
          closedMultiEntityTypesDefinitions={closedMultiEntityTypesDefinitions}
          closedMultiEntityTypesMap={closedMultiEntityTypesMap}
          entitySubgraph={entitySubgraph}
          outgoingLinksAndTargets={outgoingLinksAndTargets}
        />
      ) : (
        <LinksSectionEmptyState direction="Outgoing" />
      )}
    </SectionWrapper>
  );
};
