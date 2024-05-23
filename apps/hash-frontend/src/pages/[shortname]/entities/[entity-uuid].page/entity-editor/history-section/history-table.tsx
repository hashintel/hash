import { AngleRightRegularIcon } from "@hashintel/design-system";
import type {
  EntityEditionProvenance,
  PropertyDiff,
  PropertyProvenance,
} from "@local/hash-graph-client";
import { Box, Collapse, Stack, TableCell } from "@mui/material";
import { format } from "date-fns";
import { memo, useMemo, useState } from "react";

import { CircleInfoIcon } from "../../../../../../shared/icons/circle-info-icon";
import { Button } from "../../../../../../shared/ui/button";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableSort,
} from "../../../../../shared/virtualized-table";
import {
  defaultCellSx,
  headerHeight,
  VirtualizedTable,
} from "../../../../../shared/virtualized-table";

type FieldId = "number" | "event" | "time" | "actions";

export const historyTableRowHeight = 58;

const generateNumberColumnWidth = (rowCount: number) =>
  Math.max(50, rowCount.toString().length * 15);

const createColumns = (rowCount: number): VirtualizedTableColumn<FieldId>[] => [
  {
    id: "number",
    label: "#",
    sortable: false,
    width: generateNumberColumnWidth(rowCount),
  },
  {
    id: "event",
    label: "Event",
    sortable: false,
    width: "100%",
  },
  {
    id: "time",
    label: "Time",
    sortable: true,
    width: 110,
  },
  {
    id: "actions",
    label: "Actions",
    sortable: false,
    width: 110,
  },
];

type HistoryEventBase = {
  number: string;
  timestamp: string;
};

type CreationEvent = HistoryEventBase & {
  type: "created";
  provenance: {
    edition: EntityEditionProvenance;
  };
};

type PropertyUpdateEvent = HistoryEventBase & {
  type: "property-update";
  diff: PropertyDiff;
  provenance: {
    edition: EntityEditionProvenance;
    property: PropertyProvenance;
  };
};

type TypeUpdateEvent = HistoryEventBase & {
  type: "type-update";
  provenance: {
    edition: EntityEditionProvenance;
  };
};

export type HistoryEvent =
  | CreationEvent
  | PropertyUpdateEvent
  | TypeUpdateEvent;

const EventDetail = ({ event }: { event: HistoryEvent }) => {
  switch (event.type) {
    case "created":
      return <span>Created</span>;
    case "property-update":
      return <span>Updated property</span>;
    case "type-update":
      return <span>Updated type</span>;
  }
};

const historyEventCellSx = {
  ...defaultCellSx,
  height: historyTableRowHeight,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TableRow = memo(
  ({
    event,
    numberColumnWidth,
  }: {
    event: HistoryEvent;
    numberColumnWidth: number;
  }) => {
    const { number, timestamp } = event;

    const [showProvenance, setShowProvenance] = useState(false);

    return (
      <TableCell colSpan={4} sx={{ p: "0 !important" }}>
        <Stack
          direction="row"
          alignItems="center"
          sx={{ height: historyTableRowHeight }}
        >
          <Box
            sx={{
              ...historyEventCellSx,
              fontSize: 13,
              width: numberColumnWidth,
            }}
          >
            {number}
          </Box>
          <Box
            sx={{
              ...historyEventCellSx,
              fontSize: 13,
              lineHeight: 1.4,
              flex: 1,
            }}
          >
            <EventDetail event={event} />
          </Box>
          <Box
            sx={{
              ...historyEventCellSx,
              fontSize: 11,
              fontFamily: "monospace",
              width: 110,
            }}
          >
            <Box>
              {format(new Date(timestamp), "yyyy-MM-dd")}
              <br />
              <strong>{format(new Date(timestamp), "h:mm:ss a")}</strong>
            </Box>
          </Box>
          <Box sx={{ ...historyEventCellSx, width: 110 }}>
            <Button
              aria-label="Show provenance"
              onClick={() => setShowProvenance((prev) => !prev)}
            >
              <CircleInfoIcon
                sx={{
                  fontSize: 12,
                  color: ({ palette }) =>
                    showProvenance ? palette.blue[70] : palette.gray[70],
                }}
              />
            </Button>
            <AngleRightRegularIcon
              sx={{
                fontSize: 12,
                color: ({ palette }) =>
                  showProvenance ? palette.blue[70] : palette.gray[70],
                transition: ({ transitions }) =>
                  transitions.create("transform"),
                transform: `rotate(${showProvenance ? 0 : -90}deg)`,
              }}
            />
          </Box>
        </Stack>
        <Collapse in={showProvenance} timeout={200}>
          <Box>Provenance data</Box>
        </Collapse>
      </TableCell>
    );
  },
);

type HistoryRowData = {
  event: HistoryEvent;
  numberColumnWidth: number;
};

const createRowContent: CreateVirtualizedRowContentFn<HistoryRowData> = (
  _index,
  row,
) => (
  <TableRow
    event={row.data.event}
    numberColumnWidth={row.data.numberColumnWidth}
  />
);

export const HistoryTable = ({ events }: { events: HistoryEvent[] }) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    field: "time",
    direction: "asc",
  });

  const rows = useMemo<HistoryRowData>(() => {
    const numberColumnWidth = generateNumberColumnWidth(events.length);

    return events
      .sort((a, b) => {
        if (sort.field === "time") {
          if (sort.direction === "asc") {
            return a.timestamp > b.timestamp ? 1 : -1;
          }

          return a.timestamp > b.timestamp ? 1 : -1;
        }

        return 0;
      })
      .map((event) => ({
        id: event.number,
        data: {
          event,
          numberColumnWidth,
        },
      }));
  }, [events, sort]);

  const columns = useMemo(() => createColumns(rows.length), [rows]);

  const tableHeight = Math.min(
    600,
    Math.max(headerHeight + historyTableRowHeight * events.length + 2, 400),
  );

  return (
    <Box height={tableHeight}>
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
