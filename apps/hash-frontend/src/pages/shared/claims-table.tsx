import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { EntityId } from "@blockprotocol/type-system";
import { IconButton } from "@hashintel/design-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { SourceProvenance } from "@local/hash-graph-client/api";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, TableCell, Typography } from "@mui/material";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { CircleInfoIcon } from "../../shared/icons/circle-info-icon";
import { SourcesPopover } from "./sources-popover";
import { ValueChip } from "./value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "./virtualized-table";
import { defaultCellSx, VirtualizedTable } from "./virtualized-table";
import type {
  VirtualizedTableFilterDefinition,
  VirtualizedTableFilterDefinitionsByFieldId,
  VirtualizedTableFilterValuesByFieldId,
} from "./virtualized-table/header/filter";
import {
  isValueIncludedInFilter,
  missingValueString,
} from "./virtualized-table/header/filter";
import type { VirtualizedTableSort } from "./virtualized-table/header/sort";
import { useVirtualizedTableFilterState } from "./virtualized-table/use-filter-state";

type FieldId = "status" | "claim" | "subject" | "object" | "createdAt";

const generateColumns = (
  includeStatusColumn: boolean,
): VirtualizedTableColumn<FieldId>[] => [
  ...(includeStatusColumn
    ? [
        {
          label: "Status",
          id: "status" as const,
          sortable: true,
          width: 120,
        },
      ]
    : []),
  {
    label: "Claim",
    id: "claim" as const,
    sortable: true,
    width: 700,
  },
  {
    label: "Subject",
    id: "subject" as const,
    sortable: true,
    width: 170,
  },
  {
    label: "Relevant value",
    id: "object" as const,
    sortable: true,
    width: 170,
  },
  {
    label: "Created at",
    id: "createdAt" as const,
    sortable: true,
    width: 140,
  },
];

type ClaimResultRow = {
  claim: string;
  createdAt: Date;
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
  status: "Processing" | "Processed" | null;
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
      {status && (
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
                  status === "Processing"
                    ? palette.blue[70]
                    : palette.green[80],
                display: "inline-block",
                minHeight: 6,
                minWidth: 6,
                mr: 1,
              }}
            />
            {status}
          </Stack>
        </TableCell>
      )}
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
      <TableCell sx={cellSx}>
        <Stack justifyContent="center">
          <Typography sx={typographySx}>
            {row.createdAt.toLocaleString(undefined, {
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Typography>
        </Stack>
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<
  ClaimResultRow,
  FieldId
> = (_index, row) => <TableRow row={row.data} />;

type ClaimsTableProps = {
  claimsSubgraph: Subgraph<EntityRootType<HashEntity<Claim>>>;
  includeStatusColumn: boolean;
  onEntityClick: (entityId: EntityId) => void;
  /**
   * Include if this table is being rendered in the context of a flow that has proposed entities.
   * Omit if viewing elsewhere (e.g. on an entity's page).
   */
  proposedEntities?: Pick<ProposedEntity, "claims" | "localEntityId">[];
};

export const ClaimsTable = memo(
  ({
    claimsSubgraph,
    includeStatusColumn,
    onEntityClick,
    proposedEntities,
  }: ClaimsTableProps) => {
    const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
      fieldId: "createdAt",
      direction: "asc",
    });

    const {
      filterDefinitions,
      initialFilterValues,
      unsortedRows,
    }: {
      filterDefinitions?:
        | VirtualizedTableFilterDefinitionsByFieldId<
            Exclude<FieldId, "claim" | "createdAt">
          >
        | undefined;
      initialFilterValues?:
        | VirtualizedTableFilterValuesByFieldId<
            Exclude<FieldId, "claim" | "createdAt">
          >
        | undefined;
      unsortedRows: VirtualizedTableRow<ClaimResultRow>[];
    } = useMemo(() => {
      const rowData: VirtualizedTableRow<ClaimResultRow>[] = [];

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
        Exclude<FieldId, "claim" | "createdAt">
      >;

      const defaultFilterValues = {
        status: new Set<string>(),
        subject: new Set<string>(),
        object: new Set<string>(),
      };

      const claims =
        getRoots<EntityRootType<HashEntity<Claim>>>(claimsSubgraph);

      /**
       * We want a record of claimIds -> proposed entities to check when looping over claims,
       * rather than looping over proposed entities for each claim.
       * Only relevant if rendering in the context of viewing a flow run.
       */
      const claimToSubjectRecord: Record<EntityId, EntityId> = {};
      const claimToObjectRecord: Record<EntityId, EntityId> = {};
      for (const proposedEntity of proposedEntities ?? []) {
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
          throw new Error(
            `Claim text is not a string: ${JSON.stringify(claimText)}`,
          );
        }

        const objectText =
          claim.properties["https://hash.ai/@h/types/property-type/object/"];

        const subjectText =
          claim.properties["https://hash.ai/@h/types/property-type/subject/"];

        const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
          claimsSubgraph,
          claim.entityId,
        );

        let subjectEntityId: EntityId | undefined = undefined;
        let objectEntityId: EntityId | undefined = undefined;

        /**
         * The links will be created once there is an entity persisted in the graph to link the claim to
         */
        for (const {
          linkEntity,
          rightEntity,
        } of outgoingLinkAndTargetEntities) {
          if (
            linkEntity[0]?.metadata.entityTypeIds.includes(
              systemLinkEntityTypes.hasObject.linkEntityTypeId,
            )
          ) {
            objectEntityId = rightEntity[0]?.entityId;
          } else if (
            linkEntity[0]?.metadata.entityTypeIds.includes(
              systemLinkEntityTypes.hasSubject.linkEntityTypeId,
            )
          ) {
            subjectEntityId = rightEntity[0]?.entityId;
          }
        }

        /**
         * If we haven't found a link for the subject of the claim, the entities related to the claim haven't yet been
         * persisted. There may be an entity proposal attached to the claim, so we can check the proposals as a
         * fallback.
         *
         * This may still not yield any results if the claims haven't been processed as part of generating proposed
         * entities yet.
         */
        if (!subjectEntityId) {
          subjectEntityId = claimToSubjectRecord[claim.entityId];

          objectEntityId ??= claimToObjectRecord[claim.entityId];
        }

        const status = includeStatusColumn
          ? subjectEntityId
            ? "Processed"
            : "Processing"
          : null;

        if (status) {
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
        }

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
            createdAt: new Date(
              claim.metadata.provenance.createdAtDecisionTime,
            ),
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
    }, [claimsSubgraph, includeStatusColumn, onEntityClick, proposedEntities]);

    const [filterValues, setFilterValues] = useVirtualizedTableFilterState({
      defaultFilterValues: initialFilterValues,
      filterDefinitions,
    });

    const rows = useMemo(
      () =>
        unsortedRows
          .filter((row) => {
            for (const [fieldId, currentFilterValue] of typedEntries(
              filterValues,
            )) {
              if (!currentFilterValue) {
                return true;
              }

              let rowValue: string | EntityId | null = null;
              if (fieldId === "status") {
                if (!includeStatusColumn) {
                  return true;
                }
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

            if (fieldId === "status") {
              const baseStatus = base.data[fieldId];
              const targetStatus = target.data[fieldId];

              if (baseStatus === targetStatus) {
                return 0;
              }

              if (!baseStatus) {
                return 1;
              }

              if (!targetStatus) {
                return -1;
              }

              return baseStatus.localeCompare(targetStatus);
            }

            if (fieldId === "createdAt") {
              return (
                base.data[fieldId].getTime() - target.data[fieldId].getTime()
              );
            }

            return base.data[fieldId].localeCompare(target.data[fieldId]);
          }),
      [filterValues, includeStatusColumn, sort, unsortedRows],
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

    const columns = useMemo(
      () => generateColumns(includeStatusColumn),
      [includeStatusColumn],
    );

    return (
      <VirtualizedTable
        columns={columns}
        createRowContent={createRowContent}
        filterDefinitions={filterDefinitions}
        filterValues={filterValues}
        setFilterValues={setFilterValues}
        rows={rows}
        sort={sort}
        setSort={setSort}
      />
    );
  },
);
