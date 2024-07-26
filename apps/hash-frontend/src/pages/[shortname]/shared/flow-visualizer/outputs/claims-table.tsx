import { useQuery } from "@apollo/client";
import { IconButton } from "@hashintel/design-system";
import type { SourceProvenance } from "@local/hash-graph-client/api";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { PersistedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateEntityIdFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { deserializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { Claim } from "@local/hash-isomorphic-utils/system-types/claim";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, TableCell, Typography } from "@mui/material";
import { memo, useMemo, useRef, useState } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import { ValueChip } from "../../../../shared/value-chip";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "../../../../shared/virtualized-table";
import {
  defaultCellSx,
  VirtualizedTable,
} from "../../../../shared/virtualized-table";
import type { ProposedEntityOutput } from "../shared/types";
import { EmptyOutputBox } from "./shared/empty-output-box";
import { outputIcons } from "./shared/icons";
import { OutputContainer } from "./shared/output-container";
import { SourcesPopover } from "./shared/sources-popover";

type FieldId = "status" | "claim" | "subject" | "object";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    label: "Status",
    id: "status",
    sortable: true,
    width: 150,
  },
  {
    label: "Claim",
    id: "claim",
    sortable: true,
    width: 700,
  },
  {
    label: "Subject of claim",
    id: "subject",
    sortable: true,
    width: 140,
  },
  {
    label: "Relevant value",
    id: "object",
    sortable: true,
    width: 140,
  },
];

type ClaimResultRow = {
  claim: string;
  subject: {
    name: string;
    entityId?: EntityId;
  };
  object?: {
    name: string;
    entityId?: EntityId;
  };
  onEntityClick: (entityId: EntityId) => void;
  sources: SourceProvenance[];
  status: "Processing claim" | "Accepted" | "Ignored";
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

const ClaimValueCell = ({
  sources,
  value,
}: {
  sources: SourceProvenance[];
  value: string;
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
          {value}
        </Typography>
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
      <TableCell sx={cellSx}>{status}</TableCell>
      <ClaimValueCell sources={sources} value={claim} />
      <TableCell sx={cellSx}>
        <Box
          component="button"
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
            textAlign: "left",
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
              textAlign: "left",
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
  claimEntityIds: EntityId[];
  onEntityClick: (entityId: EntityId) => void;
  persistedEntities: PersistedEntity[];
  proposedEntities: ProposedEntityOutput[];
};

export const ClaimsTable = ({
  claimEntityIds,
  onEntityClick,
  persistedEntities,
  proposedEntities,
}: ClaimsTableProps) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    field: "subject",
    direction: "asc",
  });

  const hasData = !!claimEntityIds.length;

  const { data: claimsData } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
        filter: {
          any: claimEntityIds.map((entityId) =>
            generateEntityIdFilter({ entityId, includeArchived: false }),
          ),
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { incoming: 1, outgoing: 0 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
      },
    },
    skip: !claimEntityIds.length,
    fetchPolicy: "network-only",
  });

  const {
    rows,
  }: {
    rows: VirtualizedTableRow<ClaimResultRow>[];
  } = useMemo(() => {
    const rowData: VirtualizedTableRow<ClaimResultRow>[] = [];

    if (!claimsData) {
      return { rows: rowData };
    }

    const claims = getRoots(
      deserializeSubgraph<EntityRootType<Claim>>(
        claimsData.getEntitySubgraph.subgraph,
      ),
    );

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

      rowData.push({
        id: claim.metadata.recordId.entityId,
        data: {
          claim: claimText,
          onEntityClick,
          sources: claim.metadata.provenance.edition.sources ?? [],
          status: "Processing claim",
          subject: {
            name: claim.properties[
              "https://hash.ai/@hash/types/property-type/subject/"
            ],
          },
          object: objectText ? { name: objectText } : undefined,
        },
      });
    }

    return {
      rows: rowData,
    };
  }, [claimsData, onEntityClick]);

  return (
    <OutputContainer
      noBorder={hasData}
      sx={{
        flex: 1,
        minWidth: 400,
        "& table": {
          tableLayout: "auto",
        },
        "& th:not(:last-child)": {
          borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
        },
      }}
    >
      {hasData ? (
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          fixedColumns={3}
          rows={rows}
          sort={sort}
          setSort={setSort}
        />
      ) : (
        <EmptyOutputBox
          Icon={outputIcons.table}
          label="Claims about entities discovered by this flow will appear in a table here"
        />
      )}
    </OutputContainer>
  );
};
