import { useQuery } from "@apollo/client";
import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { SourceProvenance } from "@local/hash-graph-client/api";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import type { EntityRootType } from "@local/hash-subgraph";
import {
  entityIdFromComponents,
  stripDraftIdFromEntityId,
} from "@local/hash-subgraph";
import {
  getOutgoingLinksForEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, TableCell, Typography } from "@mui/material";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { useFlowRunsContext } from "../../../../shared/flow-runs-context";
import { ValueChip } from "../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValuesByFieldId,
} from "../../../../shared/virtualized-table/header/filter";
import {
  isValueIncludedInFilter,
  missingValueString,
} from "../../../../shared/virtualized-table/header/filter";
import type { VirtualizedTableSort } from "../../../../shared/virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "../../../../shared/virtualized-table/use-filter-state";
import type { ProposedEntityOutput } from "../shared/types";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";
import { SourcesPopover } from "./shared/sources-popover";
import { TableSkeleton } from "./shared/table-skeleton";

type FieldId = "status" | "claim" | "subject" | "object";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Status",
    id: "status",
    sortable: true,
    width: 120,
  },
  {
    label: "Claim",
    id: "claim",
    sortable: true,
    width: 700,
  },
  {
    label: "Subject",
    id: "subject",
    sortable: true,
    width: 170,
  },
  {
    label: "Relevant value",
    id: "object",
    sortable: true,
    width: 170,
  },
];

type ClaimResultRow = {
  claim: string;
  subject: {
    name: string;
    entityId: EntityId | null;
  };
  object: {
    name: string;
    entityId: EntityId | null;
  } | null;
  onEntityClick: (entityId: EntityId) => void;
  sources: SourceProvenance[];
  status: "Processing" | "Processed";
};

const typographySx = {
  color: ({ palette }) => palette.common.black,
  fontSize: 12,
  fontWeight: 500,
} as const satisfies SxProps<Theme>;

const cellSx = {
  ...defaultCellSx,
  ...typographySx,
  background: "white",
  "&:not(:last-child)": {
    borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
  },
} as const satisfies SxProps<Theme>;

const ClaimTextCell = ({
  sources,
  text,
}: {
  sources: SourceProvenance[];
  text: string;
}) => {
  const [showMetadataTooltip, setShowMetadataTooltip] = useState(false);

  const cellRef = useRef<HTMLDivElement>(null);

  const buttonId = generateUuid();

  return (
    <TableCell sx={{ ...cellSx, maxWidth: 700 }} ref={cellRef}>
      <Stack direction="row" alignItems="center">
        <Typography
          sx={{
            ...typographySx,
            lineHeight: 1,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </Typography>
        {!!sources.length && (
          <IconButton
            aria-describedby={buttonId}
            onClick={() => setShowMetadataTooltip(true)}
            sx={{ ml: 1 }}
          >
            <CircleInfoIcon
              sx={{
                fontSize: 12,
                fill: ({ palette }) => palette.gray[40],
              }}
            />
          </IconButton>
        )}
      </Stack>
      <SourcesPopover
        buttonId={buttonId}
        open={showMetadataTooltip}
        cellRef={cellRef}
        onClose={() => setShowMetadataTooltip(false)}
        sources={sources}
      />
    </TableCell>
  );
};

const TableRow = memo(({ row }: { row: ClaimResultRow }) => {
  const { claim, object, onEntityClick, sources, subject, status } = row;

  return (
    <>
      <TableCell
        sx={({ palette }) => ({
          ...cellSx,
          background:
            status === "Processing" ? palette.blue[15] : palette.gray[20],
          color:
            status === "Processing" ? palette.blue[70] : palette.common.black,
        })}
      >
        <Stack direction="row" alignItems="center">
          <Box
            aria-hidden
            component="span"
            sx={{
              borderRadius: "50%",
              background: ({ palette }) =>
                status === "Processing" ? palette.blue[70] : palette.green[80],
              display: "inline-block",
              minHeight: 6,
              minWidth: 6,
              mr: 1,
            }}
          />
          {status}
        </Stack>
      </TableCell>
      <ClaimTextCell sources={sources} text={claim} />
      <TableCell sx={cellSx}>
        <Box
          component="button"
          disabled={!subject.entityId}
          onClick={() => {
            if (subject.entityId) {
              onEntityClick(subject.entityId);
            }
          }}
          sx={{
            background: "none",
            border: "none",
            cursor: subject.entityId ? "pointer" : "default",
            p: 0,
            maxWidth: "100%",
            textAlign: "left",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            display: "block",
          }}
        >
          <ValueChip
            sx={{
              ...typographySx,
              color: ({ palette }) =>
                subject.entityId ? palette.blue[70] : palette.common.black,
            }}
          >
            {row.subject.name}
          </ValueChip>
        </Box>
      </TableCell>
      <TableCell sx={cellSx}>
        {object ? (
          <Box
            component="button"
            disabled={!object.entityId}
            onClick={() => {
              if (object.entityId) {
                onEntityClick(object.entityId);
              }
            }}
            sx={{
              background: "none",
              border: "none",
              cursor: object.entityId ? "pointer" : "default",
              p: 0,
              maxWidth: "100%",
              textAlign: "left",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            <ValueChip
              sx={{
                ...typographySx,
                color: ({ palette }) =>
                  object.entityId ? palette.blue[70] : palette.common.black,
              }}
            >
              {object.name}
            </ValueChip>
          </Box>
        ) : (
          <Typography sx={{ ...typographySx, fontStyle: "italic" }}>
            None
          </Typography>
        )}
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<
  ClaimResultRow,
  FieldId
> = (_index, row) => <TableRow row={row.data} />;

type ClaimsTableProps = {
  onEntityClick: (entityId: EntityId) => void;
  proposedEntities: ProposedEntityOutput[];
};

export const ClaimsTable = memo(
  ({ onEntityClick, proposedEntities }: ClaimsTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "subject",
      direction: "asc",
    });

    const { selectedFlowRun } = useFlowRunsContext();

    const { data: claimsData, loading: claimsDataLoading } = useQuery<
      GetEntitySubgraphQuery,
      GetEntitySubgraphQueryVariables
    >(getEntitySubgraphQuery, {
      variables: {
        includePermissions: false,
        request: {
          filter: {
            all: [
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.claim.entityTypeId,
                {
                  ignoreParents: true,
                },
              ),
              {
                equal: [
                  {
                    path: ["editionProvenance", "origin", "id"],
                  },
                  {
                    parameter: selectedFlowRun
                      ? entityIdFromComponents(
                          selectedFlowRun.webId,
                          selectedFlowRun.flowRunId,
                        )
                      : "never",
                  },
                ],
              },
            ],
          },
          graphResolveDepths: {
            ...zeroedGraphResolveDepths,
            hasLeftEntity: { incoming: 1, outgoing: 0 },
            hasRightEntity: { outgoing: 0, incoming: 0 },
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: true,
        },
      },
      pollInterval: selectedFlowRun?.closedAt ? 0 : 2_000,
      skip: !selectedFlowRun,
      fetchPolicy: "cache-and-network",
    });

    const {
      filterDefinitions,
      initialFilterValues,
      unsortedRows,
    }: {
      filterDefinitions?:
        | VirtualizedTableFilterDefinitionsByFieldId<Exclude<FieldId, "claim">>
        | undefined;
      initialFilterValues?:
        | VirtualizedTableFilterValuesByFieldId<Exclude<FieldId, "claim">>
        | undefined;
      unsortedRows: VirtualizedTableRow<ClaimResultRow>[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<ClaimResultRow>[] = [];

      if (!claimsData) {
        return { filters: undefined, unsortedRows: rowData };
      }

      const filterDefs = {
        status: {
          header: "Status",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        subject: {
          header: "Subject",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
        object: {
          header: "Relevant value",
          initialValue: new Set<string>(),
          options: {} as VirtualizedTableFilterDefinition["options"],
          type: "checkboxes",
        },
      } satisfies VirtualizedTableFilterDefinitionsByFieldId<
        Exclude<FieldId, "claim">
      >;

      const defaultFilterValues = {
        status: new Set<string>(),
        subject: new Set<string>(),
        object: new Set<string>(),
      };

      const claimsSubgraph = deserializeSubgraph<EntityRootType<Claim>>(
        claimsData.getEntitySubgraph.subgraph,
      );

      const claims = getRoots(claimsSubgraph);

      /**
       * We want a record of claimIds -> proposed entities to check when looping over claims,
       * rather than looping over proposed entities for each claim.
       */
      const claimToSubjectRecord: Record<EntityId, EntityId> = {};
      const claimToObjectRecord: Record<EntityId, EntityId> = {};
      for (const proposedEntity of proposedEntities) {
        for (const subjectClaimEntityId of proposedEntity.claims.isSubjectOf) {
          claimToSubjectRecord[subjectClaimEntityId] =
            proposedEntity.localEntityId;
        }

        for (const objectClaimEntityId of proposedEntity.claims.isObjectOf) {
          claimToObjectRecord[objectClaimEntityId] =
            proposedEntity.localEntityId;
        }
      }

      for (const claim of claims) {
        const claimText =
          claim.properties[
            "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"
          ];

        /**
         * Our textual-content property is either a string or an array of text tokens for formatted text.
         * We know we are only setting it as a string, so we can throw an error if it is not.
         */
        if (typeof claimText === "object") {
          throw new Error(`Claim text is not a string: ${claimText}`);
        }

        const objectText =
          claim.properties["https://hash.ai/@hash/types/property-type/object/"];

        const subjectText =
          claim.properties[
            "https://hash.ai/@hash/types/property-type/subject/"
          ];

        const outgoingLinks = getOutgoingLinksForEntity(
          claimsSubgraph,
          claim.entityId,
        );

        let subjectEntityId: EntityId | undefined = undefined;
        let objectEntityId: EntityId | undefined = undefined;

        /**
         * The links will be created once there is an entity persisted in the graph to link the claim to
         */
        for (const link of outgoingLinks) {
          if (
            link.metadata.entityTypeId ===
            systemLinkEntityTypes.hasObject.linkEntityTypeId
          ) {
            objectEntityId = link.linkData?.rightEntityId;
          } else if (
            link.metadata.entityTypeId ===
            systemLinkEntityTypes.hasSubject.linkEntityTypeId
          ) {
            subjectEntityId = link.linkData?.rightEntityId;
          }
        }

        /**
         * If we haven't found a link for the subject of the claim, the entities related to the claim haven't yet been
         * persisted There may be an entity proposal attached to the claim, so we can check the proposals as a fallback.
         *
         * This may still not yield any results if the claims haven't been processed as part of generating proposed
         * entities yet.
         */
        if (!subjectEntityId) {
          const claimEntityIdWithoutDraftId = stripDraftIdFromEntityId(
            claim.entityId,
          );

          subjectEntityId = claimToSubjectRecord[claimEntityIdWithoutDraftId];

          if (!objectEntityId) {
            objectEntityId = claimToObjectRecord[claimEntityIdWithoutDraftId];
          }
        }

        const status = subjectEntityId ? "Processed" : "Processing";

        /**
         * Account for the claim's values in the filters
         */
        filterDefs.status.options[status] ??= {
          label: status,
          count: 0,
          value: status,
        };
        filterDefs.status.options[status].count++;
        filterDefs.status.initialValue.add(status);
        defaultFilterValues.status.add(status);

        filterDefs.subject.options[subjectText] ??= {
          label: subjectText,
          count: 0,
          value: subjectText,
        };
        filterDefs.subject.options[subjectText].count++;
        filterDefs.subject.initialValue.add(subjectText);
        defaultFilterValues.subject.add(subjectText);

        const objectValue = objectText ?? null;
        const objectOptionsKey = objectValue ?? missingValueString;

        filterDefs.object.options[objectOptionsKey] ??= {
          label: objectValue ?? "None",
          count: 0,
          value: objectValue,
        };
        filterDefs.object.options[objectOptionsKey].count++;
        filterDefs.object.initialValue.add(objectValue as unknown as string);
        defaultFilterValues.object.add(objectValue as unknown as string);

        rowData.push({
          id: claim.metadata.recordId.entityId,
          data: {
            claim: claimText,
            onEntityClick,
            sources: claim.metadata.provenance.edition.sources ?? [],
            status,
            subject: {
              entityId: subjectEntityId ?? null,
              name: subjectText,
            },
            object: objectText
              ? { entityId: objectEntityId ?? null, name: objectText }
              : null,
          },
        });
      }

      return {
        initialFilterValues: defaultFilterValues,
        filterDefinitions: filterDefs,
        unsortedRows: rowData,
      };
    }, [claimsData, onEntityClick, proposedEntities]);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: initialFilterValues ?? null,
      filterDefinitions,
    });

    const rows = useMemo(
      () =>
        unsortedRows
          .filter((row) => {
            if (!filterValues) {
              return true;
            }

            for (const [fieldId, currentFilterValue] of typedEntries(
              filterValues,
            )) {
              let rowValue: string | EntityId | null = null;
              if (fieldId === "status") {
                rowValue = row.data.status;
              } else {
                rowValue = row.data[fieldId]?.name ?? null;
              }

              if (
                !isValueIncludedInFilter({
                  valueToCheck: rowValue,
                  currentValue: currentFilterValue,
                })
              ) {
                return false;
              }
            }

            return true;
          })
          .sort((a, b) => {
            const { fieldId, direction } = sort;

            const base = direction === "asc" ? a : b;
            const target = direction === "asc" ? b : a;

            if (fieldId === "subject" || fieldId === "object") {
              return (
                base.data[fieldId]?.name.localeCompare(
                  target.data[fieldId]?.name ?? "ZZZZZZ",
                ) ?? (target.data[fieldId] ? 1 : 0)
              );
            }

            return base.data[fieldId].localeCompare(target.data[fieldId]);
          }),
      [filterValues, sort, unsortedRows],
    );

    const outputContainerRef = useRef<HTMLDivElement>(null);
    const [outputContainerHeight, setOutputContainerHeight] = useState(400);
    useLayoutEffect(() => {
      if (
        outputContainerRef.current &&
        outputContainerRef.current.clientHeight !== outputContainerHeight
      ) {
        setOutputContainerHeight(outputContainerRef.current.clientHeight);
      }
    }, [outputContainerHeight]);

    const hasData = !!unsortedRows.length;

    return (
      <OutputContainer
        noBorder={hasData}
        ref={outputContainerRef}
        sx={{
          flex: 1,
          minWidth: 400,
          "& th:not(:last-child)": {
            borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
          },
        }}
      >
        {hasData ? (
          <VirtualizedTable
            columns={columns}
            createRowContent={createRowContent}
            filterDefinitions={filterDefinitions}
            filterValues={filterValues ?? undefined}
            setFilterValues={setFilterValues}
            rows={rows}
            sort={sort}
            setSort={setSort}
          />
        ) : claimsDataLoading ? (
          <TableSkeleton cellHeight={43} tableHeight={outputContainerHeight} />
        ) : (
          <EmptyOutputBox
            Icon={outputIcons.table}
            label={
              "Claims about entities discovered by this flow will appear in a table here"
            }
          />
        )}
      </OutputContainer>
    );
  },
);
