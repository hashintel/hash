import { useMutation } from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import {
  Chip,
  IconButton,
  PlaySolidIcon,
  Skeleton,
  StopSolidIcon,
} from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  Box,
  Stack,
  TableBody as MuiTableBody,
  TableCell as MuiTableCell,
  TableRow as MuiTableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { PropsWithChildren } from "react";
import { memo, useCallback, useMemo, useState } from "react";

import type {
  ArchiveFlowScheduleMutation,
  ArchiveFlowScheduleMutationVariables,
  PauseFlowScheduleMutation,
  PauseFlowScheduleMutationVariables,
  ResumeFlowScheduleMutation,
  ResumeFlowScheduleMutationVariables,
} from "../../graphql/api-types.gen";
import {
  archiveFlowScheduleMutation,
  pauseFlowScheduleMutation,
  resumeFlowScheduleMutation,
} from "../../graphql/queries/knowledge/flow.queries";
import { TrashRegularIcon } from "../../shared/icons/trash-regular-icon";
import { flowTableCellSx, flowTableRowHeight } from "../shared/flow-tables";
import { useFlowSchedules } from "../shared/use-flow-schedules";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../shared/virtualized-table";
import { VirtualizedTable } from "../shared/virtualized-table";
import { virtualizedTableHeaderHeight } from "../shared/virtualized-table/header";
import type { VirtualizedTableSort } from "../shared/virtualized-table/header/sort";

type FieldId = "name" | "interval" | "status" | "actions";

const columns: VirtualizedTableColumn<FieldId>[] = [
  { id: "name", label: "Name", sortable: true, width: "40%" },
  { id: "interval", label: "Interval", sortable: false, width: "30%" },
  { id: "status", label: "Status", sortable: true, width: "15%" },
  { id: "actions", label: "", sortable: false, width: "15%" },
];

type ScheduleRowData = {
  schedule: Simplified<HashEntity<FlowSchedule>>;
  intervalText: string;
};

const formatIntervalMs = (ms: number): string => {
  const minutes = ms / (60 * 1000);
  if (minutes < 60) {
    return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `Every ${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = hours / 24;
  return `Every ${days} day${days !== 1 ? "s" : ""}`;
};

const ScheduleRow = memo(
  ({
    rowData,
    onPause,
    onResume,
    onArchive,
    isPending,
  }: {
    rowData: ScheduleRowData;
    onPause: (entityId: EntityId) => void;
    onResume: (entityId: EntityId) => void;
    onArchive: (entityId: EntityId) => void;
    isPending: boolean;
  }) => {
    const { schedule, intervalText } = rowData;
    const isActive = schedule.properties.scheduleStatus === "active";

    return (
      <>
        <MuiTableCell sx={{ ...flowTableCellSx, fontSize: 13 }}>
          <Typography
            sx={{
              overflow: "hidden",
              fontSize: 14,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            {schedule.properties.name}
          </Typography>
        </MuiTableCell>
        <MuiTableCell
          sx={{ ...flowTableCellSx, fontSize: 12, fontFamily: "monospace" }}
        >
          {intervalText}
        </MuiTableCell>
        <MuiTableCell sx={flowTableCellSx}>
          <Chip
            label={isActive ? "Active" : "Paused"}
            size="small"
            sx={{
              backgroundColor: ({ palette }) =>
                isActive ? palette.green[20] : palette.gray[20],
              color: ({ palette }) =>
                isActive ? palette.green[80] : palette.gray[70],
              fontWeight: 600,
              fontSize: 11,
            }}
          />
        </MuiTableCell>
        <MuiTableCell sx={flowTableCellSx}>
          <Stack direction="row" spacing={0.5}>
            {isActive ? (
              <Tooltip title="Pause schedule" placement="top">
                <IconButton
                  onClick={() => onPause(schedule.metadata.recordId.entityId)}
                  disabled={isPending}
                  size="medium"
                  sx={{ p: 0.5 }}
                >
                  <StopSolidIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Resume schedule">
                <IconButton
                  onClick={() => onResume(schedule.metadata.recordId.entityId)}
                  disabled={isPending}
                  size="medium"
                  sx={{ p: 0.5 }}
                >
                  <PlaySolidIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Archive schedule" placement="top">
              <IconButton
                onClick={() => onArchive(schedule.metadata.recordId.entityId)}
                disabled={isPending}
                size="small"
                sx={{ p: 0.5 }}
              >
                <TrashRegularIcon
                  sx={{ fontSize: 16, color: ({ palette }) => palette.red[50] }}
                />
              </IconButton>
            </Tooltip>
          </Stack>
        </MuiTableCell>
      </>
    );
  },
);

const placeholderHeight = 150;

const PlaceholderContainer = ({
  children,
  columnCount,
}: PropsWithChildren<{ columnCount: number }>) => (
  <MuiTableBody>
    <MuiTableRow>
      <MuiTableCell colSpan={columnCount} sx={{ height: placeholderHeight }}>
        {children}
      </MuiTableCell>
    </MuiTableRow>
  </MuiTableBody>
);

const EmptyComponent = ({ columnCount }: { columnCount: number }) => (
  <PlaceholderContainer columnCount={columnCount}>
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ fontSize: 14, height: "100%" }}
    >
      No schedules yet
    </Stack>
  </PlaceholderContainer>
);

const LoadingComponent = ({ columnCount }: { columnCount: number }) => (
  <PlaceholderContainer columnCount={columnCount}>
    <Box sx={{ height: "100%", marginTop: -0.6 }}>
      <Skeleton height="100%" />
    </Box>
  </PlaceholderContainer>
);

export const FlowSchedulesTable = () => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    fieldId: "name",
    direction: "asc",
  });

  const [pendingEntityId, setPendingEntityId] = useState<EntityId | null>(null);

  const { schedulesByEntityUuid, loading, refetch } = useFlowSchedules();

  const [pauseSchedule] = useMutation<
    PauseFlowScheduleMutation,
    PauseFlowScheduleMutationVariables
  >(pauseFlowScheduleMutation);

  const [resumeSchedule] = useMutation<
    ResumeFlowScheduleMutation,
    ResumeFlowScheduleMutationVariables
  >(resumeFlowScheduleMutation);

  const [archiveSchedule] = useMutation<
    ArchiveFlowScheduleMutation,
    ArchiveFlowScheduleMutationVariables
  >(archiveFlowScheduleMutation);

  const handlePause = async (entityId: EntityId) => {
    setPendingEntityId(entityId);
    try {
      await pauseSchedule({ variables: { scheduleEntityId: entityId } });
      await refetch();
    } finally {
      setPendingEntityId(null);
    }
  };

  const handleResume = async (entityId: EntityId) => {
    setPendingEntityId(entityId);
    try {
      await resumeSchedule({ variables: { scheduleEntityId: entityId } });
      await refetch();
    } finally {
      setPendingEntityId(null);
    }
  };

  const handleArchive = async (entityId: EntityId) => {
    setPendingEntityId(entityId);
    try {
      await archiveSchedule({ variables: { scheduleEntityId: entityId } });
      await refetch();
    } finally {
      setPendingEntityId(null);
    }
  };

  const rows = useMemo<VirtualizedTableRow<ScheduleRowData>[]>(() => {
    const rowData = Array.from(schedulesByEntityUuid.values()).map(
      (schedule) => {
        let intervalText = "Unknown";
        const scheduleSpec = schedule.properties.scheduleSpec as ScheduleSpec;

        if (scheduleSpec.type === "interval") {
          intervalText = formatIntervalMs(scheduleSpec.intervalMs);
        } else {
          intervalText = `Cron: ${scheduleSpec.cronExpression}`;
        }

        return {
          id: schedule.metadata.recordId.entityId,
          data: {
            schedule,
            intervalText,
          },
        };
      },
    );

    return rowData.sort((a, b) => {
      const field = sort.fieldId;
      const direction = sort.direction === "asc" ? 1 : -1;

      if (field === "name") {
        return (
          a.data.schedule.properties.name.localeCompare(
            b.data.schedule.properties.name,
          ) * direction
        );
      }

      if (field === "status") {
        return (
          a.data.schedule.properties.scheduleStatus.localeCompare(
            b.data.schedule.properties.scheduleStatus,
          ) * direction
        );
      }

      return 0;
    });
  }, [schedulesByEntityUuid, sort]);

  const createRowContent: CreateVirtualizedRowContentFn<ScheduleRowData> = (
    _index,
    { data: rowData },
  ) => (
    <ScheduleRow
      rowData={rowData}
      onPause={handlePause}
      onResume={handleResume}
      onArchive={handleArchive}
      isPending={
        pendingEntityId === rowData.schedule.metadata.recordId.entityId
      }
    />
  );

  const tableHeight = Math.min(
    400,
    virtualizedTableHeaderHeight +
      2 + // borders
      (rows.length ? rows.length * flowTableRowHeight : placeholderHeight),
  );

  const EmptyPlaceholder = useCallback(
    () => <EmptyComponent columnCount={columns.length} />,
    [],
  );

  const LoadingPlaceholder = useCallback(
    () => <LoadingComponent columnCount={columns.length} />,
    [],
  );

  return (
    <Box sx={{ height: tableHeight }}>
      <VirtualizedTable
        columns={columns}
        createRowContent={createRowContent}
        EmptyPlaceholder={loading ? LoadingPlaceholder : EmptyPlaceholder}
        rows={rows}
        sort={sort}
        setSort={setSort}
      />
    </Box>
  );
};
