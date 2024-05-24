import { AngleRightRegularIcon, IconButton } from "@hashintel/design-system";
import type {
  EntityEditionProvenance,
  EntityType,
  PropertyDiff,
  PropertyProvenance,
  PropertyType,
} from "@local/hash-graph-client";
import {
  Box,
  Collapse,
  Stack,
  SxProps,
  TableCell,
  tableContainerClasses,
  tableHeadClasses,
  Theme,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { memo, PropsWithChildren, useMemo, useState } from "react";

import { CircleInfoIcon } from "../../../../../../shared/icons/circle-info-icon";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "../../../../../shared/virtualized-table";
import {
  defaultCellSx,
  headerHeight,
  VirtualizedTable,
} from "../../../../../shared/virtualized-table";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

type FieldId = "number" | "event" | "time" | "actions";

export const historyTableRowHeight = 43;

const generateNumberColumnWidth = (rowCount: number) =>
  Math.max(50, rowCount.toString().length * 15);

const createColumns = (rowCount: number): VirtualizedTableColumn<FieldId>[] => [
  {
    id: "number",
    label: "#",
    sortable: false,
    textSx: { color: ({ palette }) => palette.gray[50], fontWeight: 400 },
    width: generateNumberColumnWidth(rowCount) + 16,
  },
  {
    id: "event",
    label: "Event",
    sortable: false,
    textSx: { fontWeight: 600 },
    width: "100%",
  },
  {
    id: "time",
    label: "Timestamp",
    sortable: true,
    textSx: { fontWeight: 600 },
    width: 180,
  },
  {
    id: "actions",
    label: "Actions",
    sortable: false,
    textSx: { fontWeight: 600 },
    width: 110,
  },
];

type HistoryEventBase = {
  number: string;
  timestamp: string;
};

type CreationEvent = HistoryEventBase & {
  type: "created";
  entity: Entity;
  entityType: EntityType;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

type PropertyUpdateEvent = HistoryEventBase & {
  type: "property-update";
  diff: PropertyDiff;
  propertyType: PropertyType;
  provenance: {
    edition: EntityEditionProvenance;
    property?: PropertyProvenance;
  };
};

type TypeUpdateEvent = HistoryEventBase & {
  type: "type-update";
  entityType: EntityType;
  provenance: {
    edition: EntityEditionProvenance;
  };
};

export type HistoryEvent =
  | CreationEvent
  | PropertyUpdateEvent
  | TypeUpdateEvent;

const Chip = ({
  children,
  type,
  sx,
  value,
}: PropsWithChildren<{
  type?: boolean;
  sx?: SxProps<Theme>;
  value?: boolean;
}>) => (
  <Stack
    direction="row"
    alignItems="center"
    sx={[
      ({ palette }) => ({
        background: palette.common.white,
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: type ? 4 : 2,
        fontWeight: 500,
        fontSize: 12,
        px: value ? 1.2 : 1,
        py: 0.5,
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Stack>
);

const EventDetail = ({
  event,
  subgraph,
}: {
  event: HistoryEvent;
  subgraph: Subgraph;
}) => {
  switch (event.type) {
    case "created": {
      const entityLabel = generateEntityLabel(
        subgraph as Subgraph<EntityRootType>,
        event.entity,
      );
      return (
        <>
          <Chip>{entityLabel}</Chip>
          <Box mx={1}>created with type</Box>
          <Chip type>{event.entityType.title}</Chip>
        </>
      );
    }
    case "property-update": {
      const { diff, propertyType } = event;

      switch (diff.op) {
        case "added": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip> <Box mx={1}>added as</Box>
              <Chip value>{diff.added}</Chip>
            </>
          );
        }
        case "removed": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip>{" "}
              <Box mx={1}>removed, was</Box>
              <Chip value>{diff.removed}</Chip>
            </>
          );
        }
        case "changed": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip>{" "}
              <Box mx={1}>updated from</Box>
              <Chip value>{diff.old}</Chip>
              <Box mx={1}>to</Box>
              <Chip value>{diff.new}</Chip>
            </>
          );
        }
      }
    }
    case "type-update":
      return <span>Updated type</span>;
  }
};

const typographySx: SxProps<Theme> = {
  fontSize: 14,
};

const historyEventCellSx: SxProps<Theme> = {
  ...typographySx,
  ...defaultCellSx,
  borderBottom: "none",
  color: ({ palette }) => palette.common.black,
  height: historyTableRowHeight,
  py: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const ProvenanceHeader = ({ label }: { label: string }) => (
  <Typography sx={{ color: "black", fontWeight: 700, fontSize: 14, mb: 1 }}>
    {label}
  </Typography>
);

const Provenance = ({ event }: { event: HistoryEvent }) => {
  const actionText = event.type === "created" ? "Created by" : "Updated by";

  return (
    <Box
      py={2}
      px={4}
      sx={({ palette }) => ({
        background: palette.blue[10],
        borderTop: `1px solid ${palette.blue[20]}`,
        borderRadius: 2,
      })}
    >
      <Stack direction="row" gap={4}>
        <Box>
          <ProvenanceHeader label="Change origins" />
          <Typography sx={typographySx}>
            {actionText}
            {" Ciaran Morinan"}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
};

const TableRow = memo(
  ({
    event,
    isFirstRow,
    isLastRow,
    numberColumnWidth,
    subgraph,
  }: HistoryRowData) => {
    const { number, timestamp } = event;

    const [showProvenance, setShowProvenance] = useState(false);

    const [editionNumber, changedPropertyNumber] = number.split(".");

    return (
      <TableCell
        colSpan={4}
        sx={{
          border: "none",
          height: historyTableRowHeight,
          py: "0 !important",
          px: 1,
        }}
      >
        <Box
          sx={({ palette, transitions }) => ({
            borderRadius: 2,
            background: showProvenance
              ? palette.blue[15]
              : palette.common.white,
            border: `1px solid ${showProvenance ? palette.blue[20] : "transparent"}`,
            mb: isLastRow ? 1 : 0,
            mt: isFirstRow ? 1 : 0,
            transition: transitions.create(["background", "border"]),
          })}
        >
          <Stack direction="row" alignItems="center">
            <Box
              sx={{
                ...historyEventCellSx,
                fontSize: 13,
                width: numberColumnWidth,
              }}
            >
              <Typography sx={typographySx}>{editionNumber}</Typography>
              {changedPropertyNumber && (
                <Typography
                  sx={{
                    ...typographySx,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  .{changedPropertyNumber}
                </Typography>
              )}
            </Box>
            <Box
              sx={{
                ...historyEventCellSx,
                fontSize: 13,
                lineHeight: 1.4,
                flexGrow: 1,
                justifyContent: "flex-start",
              }}
            >
              <Stack
                direction="row"
                justifyContent="flex-start"
                alignItems="center"
              >
                <EventDetail event={event} subgraph={subgraph} />
              </Stack>
            </Box>
            <Box
              sx={{
                ...historyEventCellSx,
                width: 180,
              }}
            >
              {format(new Date(timestamp), "yyyy-MM-dd h:mma")}
            </Box>
            <Stack
              direction="row"
              sx={{
                ...historyEventCellSx,
                justifyContent: "flex-start",
                alignItems: "center",
                width: 110,
              }}
            >
              <IconButton
                aria-label="Show provenance"
                onClick={() => setShowProvenance((prev) => !prev)}
                sx={{
                  "&:hover": { background: "none" },
                  "& svg": { fontSize: 14 },
                }}
              >
                <CircleInfoIcon
                  sx={{
                    color: ({ palette }) =>
                      showProvenance ? palette.blue[70] : palette.gray[70],
                  }}
                />
                <AngleRightRegularIcon
                  sx={{
                    color: ({ palette }) =>
                      showProvenance ? palette.blue[70] : palette.gray[70],
                    marginLeft: showProvenance ? 0.5 : 1,
                    marginTop: showProvenance ? 1 : 0,
                    transition: ({ transitions }) =>
                      transitions.create(["transform", "margin"]),
                    transform: `rotate(${showProvenance ? 90 : 0}deg)`,
                  }}
                />
              </IconButton>
            </Stack>
          </Stack>
          <Collapse in={showProvenance} timeout={200}>
            <Provenance event={event} />
          </Collapse>
        </Box>
      </TableCell>
    );
  },
);

type HistoryRowData = {
  event: HistoryEvent;
  isFirstRow: boolean;
  isLastRow: boolean;
  numberColumnWidth: number;
  subgraph: Subgraph;
};

const createRowContent: CreateVirtualizedRowContentFn<HistoryRowData> = (
  _index,
  row,
) => (
  <TableRow
    event={row.data.event}
    numberColumnWidth={row.data.numberColumnWidth}
    isFirstRow={row.data.isFirstRow}
    isLastRow={row.data.isLastRow}
    subgraph={row.data.subgraph}
  />
);

export const HistoryTable = ({
  events,
  subgraph,
}: {
  events: HistoryEvent[];
  subgraph: Subgraph;
}) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    field: "time",
    direction: "desc",
  });

  const rows = useMemo<VirtualizedTableRow<HistoryRowData>[]>(() => {
    const numberColumnWidth = generateNumberColumnWidth(events.length);

    return events
      .sort((a, b) => {
        if (sort.field === "time") {
          if (sort.direction === "asc") {
            if (a.timestamp === b.timestamp) {
              return a.number.localeCompare(b.number);
            }
            return a.timestamp > b.timestamp ? 1 : -1;
          }

          if (a.timestamp === b.timestamp) {
            return b.number.localeCompare(a.number);
          }
          return a.timestamp > b.timestamp ? -1 : 1;
        }

        return 0;
      })
      .map((event, index) => ({
        id: event.number,
        data: {
          event,
          isFirstRow: index === 0,
          isLastRow: index === events.length - 1,
          numberColumnWidth,
          subgraph,
        },
      }));
  }, [events, sort, subgraph]);

  const columns = useMemo(() => createColumns(rows.length), [rows]);

  const tableHeight = Math.min(
    600,
    Math.max(headerHeight + historyTableRowHeight * events.length + 2, 400),
  );

  return (
    <Box
      height={tableHeight}
      sx={{
        [`& .${tableContainerClasses.root}`]: { overflowY: "scroll" },
        [`& .${tableHeadClasses.root} th:first-of-type`]: {
          pl: 3,
        },
      }}
    >
      <VirtualizedTable
        columns={columns}
        createRowContent={createRowContent}
        rows={rows}
        sort={sort}
        setSort={setSort}
      />
    </Box>
  );
};
