import type { Subgraph } from "@blockprotocol/graph";
import { AngleRightRegularIcon, IconButton } from "@hashintel/design-system";
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
import { memo, useMemo, useRef, useState } from "react";

import { CircleInfoIcon } from "../../../../../shared/icons/circle-info-icon";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../../../virtualized-table";
import { defaultCellSx, VirtualizedTable } from "../../../virtualized-table";
import { virtualizedTableHeaderHeight } from "../../../virtualized-table/header";
import type { VirtualizedTableSort } from "../../../virtualized-table/header/sort";
import { Provenance } from "./history-table/provenance";
import { EventDetail } from "./history-table/shared/event-detail";
import type { HistoryEvent } from "./shared/types";

type FieldId = "number" | "event" | "time" | "actions";

export const historyTableRowHeight = 43;

const generateNumberColumnWidth = (rowCount: number) =>
  Math.max(50, rowCount.toString().length * 15);

const timeWidth = 180;
const actionsWidth = 110;

const createColumns = (rowCount: number): VirtualizedTableColumn<FieldId>[] => {
  const numberWidth = generateNumberColumnWidth(rowCount) + 16;

  return [
    {
      id: "number",
      label: "#",
      sortable: false,
      textSx: { color: ({ palette }) => palette.gray[50], fontWeight: 400 },
      width: numberWidth,
    },
    {
      id: "event",
      label: "Event",
      sortable: false,
      textSx: { fontWeight: 600 },
      width: `calc(100% - ${numberWidth + timeWidth + actionsWidth}px)`,
    },
    {
      id: "time",
      label: "Timestamp",
      sortable: true,
      textSx: { fontWeight: 600 },
      width: timeWidth,
    },
    {
      id: "actions",
      label: "Actions",
      sortable: false,
      textSx: { fontWeight: 600 },
      width: actionsWidth,
    },
  ];
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

const TableRow = memo(
  ({
    event,
    isFirstRow,
    isLastRow,
    numberColumnWidth,
    scrollContainerRef,
    shortname,
    subgraph,
  }: HistoryRowData) => {
    const { number, timestamp } = event;

    const [showProvenance, setShowProvenance] = useState(false);

    const [editionNumber, subChangeNumber] = number.split(".");

    const provenanceRef = useRef<HTMLDivElement>(null);

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
            border: `1px solid ${
              showProvenance ? palette.blue[20] : "transparent"
            }`,
            mb: isLastRow || showProvenance ? 1 : 0,
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
              {subChangeNumber && (
                <Typography
                  sx={{
                    ...typographySx,
                    color: ({ palette }) => palette.gray[60],
                  }}
                >
                  .{subChangeNumber}
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
                maxWidth: `calc(100% - ${numberColumnWidth + timeWidth + actionsWidth}px)`,
              }}
            >
              <Stack
                direction="row"
                justifyContent="flex-start"
                alignItems="center"
                sx={{ maxWidth: "100%" }}
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
                onClick={() => {
                  setShowProvenance((prev) => !prev);

                  if (!showProvenance) {
                    setTimeout(() => {
                      const contentRect =
                        provenanceRef.current?.getBoundingClientRect();

                      const containerRect =
                        scrollContainerRef.current?.getBoundingClientRect();

                      if (!contentRect || !containerRect) {
                        return;
                      }

                      const isAlreadyFullyVisible =
                        contentRect.top >= 0 &&
                        contentRect.bottom <= containerRect.bottom;

                      if (!isAlreadyFullyVisible) {
                        provenanceRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }
                    }, 200);
                  }
                }}
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
          <Collapse in={showProvenance} ref={provenanceRef} timeout={200}>
            <Provenance
              event={event}
              shortname={shortname}
              subgraph={subgraph}
            />
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
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  shortname: string;
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
    scrollContainerRef={row.data.scrollContainerRef}
    shortname={row.data.shortname}
    subgraph={row.data.subgraph}
  />
);

export const HistoryTable = ({
  events,
  shortname,
  subgraph,
}: {
  events: HistoryEvent[];
  shortname: string;
  subgraph: Subgraph;
}) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    fieldId: "time",
    direction: "desc",
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<VirtualizedTableRow<HistoryRowData>[]>(() => {
    const numberColumnWidth = generateNumberColumnWidth(events.length);

    return events
      .sort((a, b) => {
        if (sort.fieldId === "time") {
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
          scrollContainerRef,
          shortname,
          subgraph,
        },
      }));
  }, [events, sort, subgraph, scrollContainerRef, shortname]);

  const columns = useMemo(() => createColumns(rows.length), [rows]);

  const tableHeight = Math.min(
    600,
    Math.max(
      virtualizedTableHeaderHeight + historyTableRowHeight * events.length + 2,
      400,
    ),
  );

  return (
    <Box
      height={tableHeight}
      ref={scrollContainerRef}
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
