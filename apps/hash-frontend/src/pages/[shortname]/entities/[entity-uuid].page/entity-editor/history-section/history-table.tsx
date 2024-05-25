import { AngleRightRegularIcon, IconButton } from "@hashintel/design-system";
import type { Subgraph } from "@local/hash-subgraph";
import type { SxProps, Theme } from "@mui/material";
import {
  Box,
  Collapse,
  Stack,
  TableCell,
  tableContainerClasses,
  tableHeadClasses,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { memo, useMemo, useState } from "react";

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
import { Provenance } from "./history-table/provenance";
import { EventDetail } from "./history-table/shared/event-detail";
import type { HistoryEvent } from "./shared/types";

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
            <Provenance event={event} subgraph={subgraph} />
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
