import {
  Box,
  Stack,
  TableCell as MuiTableCell,
  Tooltip,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import { memo, useCallback, useMemo, useState } from "react";

import {
  BullseyeLightIcon,
  ClockRegularIcon,
  InfinityLightIcon,
  Skeleton,
} from "@hashintel/design-system";
import { isGoalFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { Link } from "../../shared/ui/link";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useFlowRunsContext } from "../shared/flow-runs-context";
import {
  flowRunStatusToStatusText,
  FlowStatusChip,
  flowTableCellSx,
  FlowTableChip,
  flowTableRowHeight,
  FlowTableWebChip,
} from "../shared/flow-tables";
import { useFlowRunsUsage } from "../shared/use-flow-runs-usage";
import { VirtualizedTable } from "../shared/virtualized-table";
import { virtualizedTableHeaderHeight } from "../shared/virtualized-table/header";
import {
  PlaceholderContainer,
  placeholderHeight,
} from "./shared/table-placeholder";

import type { SimpleFlowRunStatus } from "../shared/flow-tables";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "../shared/virtualized-table";
import type { VirtualizedTableSort } from "../shared/virtualized-table/header/sort";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";

type FieldId =
  | "web"
  | "type"
  | "name"
  | "startedAt"
  | "closedAt"
  | "status"
  | "cost";

const createColumns: (
  usageAvailable: boolean,
) => VirtualizedTableColumn<FieldId>[] = (usageAvailable) => [
  {
    id: "web",
    label: "Web",
    sortable: true,
    width: 150,
  },
  {
    id: "type",
    label: "Type",
    sortable: true,
    width: 100,
  },
  {
    id: "name",
    label: "Name",
    sortable: true,
    width: "auto",
  },
  {
    id: "startedAt",
    label: "Started At",
    sortable: true,
    width: 170,
  },
  {
    id: "closedAt",
    label: "Finished At",
    sortable: true,
    width: 170,
  },
  {
    id: "status",
    label: "Status",
    sortable: true,
    width: 140,
  },
  ...(usageAvailable
    ? [
        {
          id: "cost" as const,
          label: "Cost",
          sortable: true,
          width: 80,
        },
      ]
    : []),
];

type WorkerSummary = Subtype<
  Record<FieldId, unknown>,
  {
    flowRunEntityId: EntityId;
    flowScheduleId: EntityUuid | null;
    startedAt: string;
    closedAt: string | null;
    type: "flow" | "goal";
    web: {
      avatarUrl?: string;
      name: string;
      shortname: string;
      isOrg: boolean;
    };
    name: string;
    status: SimpleFlowRunStatus;
    cost: number | null;
    usageAvailable: boolean;
  }
>;

const TableRow = memo(({ workerSummary }: { workerSummary: WorkerSummary }) => {
  const {
    web,
    flowRunEntityId,
    flowScheduleId,
    type,
    name,
    startedAt,
    closedAt,
    status,
    cost,
    usageAvailable,
  } = workerSummary;

  const Icon = type === "flow" ? InfinityLightIcon : BullseyeLightIcon;

  return (
    <>
      <MuiTableCell
        sx={{ ...flowTableCellSx, fontSize: 13, overflowX: "hidden" }}
      >
        <FlowTableWebChip {...web} />
      </MuiTableCell>
      <MuiTableCell sx={flowTableCellSx}>
        <FlowTableChip>
          <Icon
            sx={{ fontSize: 14, fill: ({ palette }) => palette.blue[70] }}
          />
          <Typography
            component="span"
            sx={{
              fontSize: 12,
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {type}
          </Typography>
        </FlowTableChip>
      </MuiTableCell>
      <MuiTableCell sx={flowTableCellSx}>
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Link
            href={generateWorkerRunPath({
              shortname: web.shortname,
              flowRunEntityId,
            })}
            sx={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {name}
          </Link>
          {flowScheduleId && (
            <Tooltip title="Triggered by a schedule">
              <ClockRegularIcon
                sx={{
                  fontSize: 14,
                  color: ({ palette }) => palette.blue[70],
                }}
              />
            </Tooltip>
          )}
        </Stack>
      </MuiTableCell>
      <MuiTableCell sx={flowTableCellSx}>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {format(new Date(startedAt), "yyyy-MM-dd HH:mm a")}
        </Typography>
      </MuiTableCell>
      <MuiTableCell sx={flowTableCellSx}>
        <Typography
          sx={{
            fontSize: 13,
            color: ({ palette }) =>
              closedAt ? palette.gray[70] : palette.common.black,
            fontWeight: closedAt ? 400 : 600,
          }}
        >
          {closedAt
            ? format(new Date(closedAt), "yyyy-MM-dd HH:mm a")
            : "Currently running"}
        </Typography>
      </MuiTableCell>
      <MuiTableCell sx={flowTableCellSx}>
        <FlowStatusChip status={status} />
      </MuiTableCell>
      {usageAvailable ? (
        <MuiTableCell sx={flowTableCellSx}>
          <Typography
            sx={{
              fontSize: 13,
              color: ({ palette }) => palette.gray[70],
              fontWeight: 500,
            }}
          >
            {cost ? `$${cost.toFixed(2)}` : undefined}
          </Typography>
        </MuiTableCell>
      ) : null}
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<WorkerSummary> = (
  _index,
  row,
) => <TableRow workerSummary={row.data} />;

const EmptyComponent = ({
  columnCount,
  filtered,
}: {
  columnCount: number;
  filtered: boolean;
}) => (
  <PlaceholderContainer columnCount={columnCount}>
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ fontSize: 14, height: "100%" }}
    >
      No worker activity {filtered && "for this flow"} yet
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

type FlowRunTableProps = {
  flowDefinitionEntityIdFilter?: string[];
};

export const FlowRunTable = ({
  flowDefinitionEntityIdFilter,
}: FlowRunTableProps) => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    fieldId: "closedAt",
    direction: "desc",
  });

  const {
    flowRuns: unfilteredFlowRuns,
    totalCount,
    nextCursor,
    loading,
    pagination,
  } = useFlowRunsContext();

  const { authenticatedUser } = useAuthenticatedUser();

  const filteredFlowRuns = useMemo(() => {
    if (
      !flowDefinitionEntityIdFilter ||
      flowDefinitionEntityIdFilter.length === 0
    ) {
      return unfilteredFlowRuns;
    }
    return unfilteredFlowRuns.filter((run) =>
      flowDefinitionEntityIdFilter.includes(run.flowDefinitionEntityId),
    );
  }, [unfilteredFlowRuns, flowDefinitionEntityIdFilter]);

  const { isUsageAvailable: usageAvailable, usageByFlowRun } = useFlowRunsUsage(
    {
      flowRunEntityIds: filteredFlowRuns.map((run) => run.flowRunEntityId),
    },
  );

  const flowRunRows = useMemo<VirtualizedTableRow<WorkerSummary>[]>(() => {
    const webByWebId: Record<string, WorkerSummary["web"] | undefined> = {};

    const rowData: VirtualizedTableRow<WorkerSummary>[] = filteredFlowRuns.map(
      (flowRun) => {
        const type = isGoalFlowDefinitionEntityId(
          flowRun.flowDefinitionEntityId,
        )
          ? "goal"
          : "flow";

        const { webId, flowRunEntityId, startedAt, closedAt, status } = flowRun;

        let web: WorkerSummary["web"] | undefined = webByWebId[webId];

        if (!web) {
          if (webId === authenticatedUser.accountId) {
            web = {
              avatarUrl:
                authenticatedUser.hasAvatar?.imageEntity.properties[
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
                ],
              name: authenticatedUser.displayName ?? "Unknown",
              shortname: authenticatedUser.shortname ?? "unknown",
              isOrg: false,
            };
          } else {
            const org = authenticatedUser.memberOf.find(
              (memberOf) => memberOf.org.webId === webId,
            )?.org;
            if (!org) {
              throw new Error(`Could not find org with id ${webId}`);
            }
            web = {
              avatarUrl:
                org.hasAvatar?.imageEntity.properties[
                  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
                ],
              name: org.name,
              shortname: org.shortname,
              isOrg: true,
            };
          }
          webByWebId[webId] = web;
        }

        const cost = usageByFlowRun[flowRunEntityId]?.total ?? null;

        // Extract flowScheduleId if present (for scheduled runs)
        const flowScheduleId = flowRun.flowScheduleId ?? null;

        return {
          id: flowRunEntityId,
          data: {
            flowRunEntityId,
            flowScheduleId,
            web,
            type,
            name: flowRun.name,
            closedAt: closedAt ?? null,
            startedAt,
            status: flowRunStatusToStatusText(status),
            cost,
            usageAvailable,
          },
        };
      },
    );

    return rowData.sort((a, b) => {
      const field = sort.fieldId;
      const direction = sort.direction === "asc" ? 1 : -1;

      if (field === "web") {
        return a.data[field].name.localeCompare(b.data[field].name) * direction;
      }

      if (field === "cost") {
        return ((a.data[field] ?? 0) - (b.data[field] ?? 0)) * direction;
      }

      return (
        (a.data[field] ?? "").localeCompare(b.data[field] ?? "") * direction
      );
    });
  }, [
    authenticatedUser,
    filteredFlowRuns,
    sort,
    usageByFlowRun,
    usageAvailable,
  ]);

  const tableHeight = Math.min(
    600,
    virtualizedTableHeaderHeight +
      2 + // borders
      (flowRunRows.length
        ? flowRunRows.length * flowTableRowHeight
        : placeholderHeight),
  );

  const columns = useMemo(
    () => createColumns(usageAvailable),
    [usageAvailable],
  );

  const EmptyPlaceholder = useCallback(
    () => (
      <EmptyComponent
        columnCount={columns.length}
        filtered={!!flowDefinitionEntityIdFilter?.length}
      />
    ),
    [columns, flowDefinitionEntityIdFilter],
  );

  const LoadingPlaceholder = useCallback(
    () => <LoadingComponent columnCount={columns.length} />,
    [columns],
  );

  return (
    <Box>
      <Box sx={{ height: tableHeight }}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          EmptyPlaceholder={loading ? LoadingPlaceholder : EmptyPlaceholder}
          rows={flowRunRows}
          sort={sort}
          setSort={setSort}
        />
      </Box>
      {pagination &&
        (flowRunRows.length > 0 || pagination.previousCursors.length > 0) && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1, py: 1.5 }}
          >
            <Typography
              sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
            >
              Showing <strong>{flowRunRows.length}</strong> result
              {flowRunRows.length !== 1 ? "s" : ""}
              {totalCount > 0 && (
                <>
                  {" "}
                  of ~<strong>{totalCount}</strong> total
                </>
              )}
            </Typography>
            <Stack direction="row" gap={2}>
              {pagination.previousCursors.length > 0 && (
                <Typography
                  component="button"
                  onClick={() => pagination.onPreviousPage()}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: ({ palette }) => palette.blue[70],
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    "&:hover": {
                      textDecoration: "underline",
                    },
                  }}
                >
                  Previous page
                </Typography>
              )}
              {nextCursor && (
                <Typography
                  component="button"
                  onClick={() => pagination.onNextPage(nextCursor)}
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: ({ palette }) => palette.blue[70],
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    "&:hover": {
                      textDecoration: "underline",
                    },
                  }}
                >
                  Next page
                </Typography>
              )}
            </Stack>
          </Stack>
        )}
    </Box>
  );
};
