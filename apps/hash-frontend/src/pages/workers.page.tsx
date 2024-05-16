import {
  Avatar,
  BullseyeLightIcon,
  InfinityLightIcon,
  TerminalLightIcon,
} from "@hashintel/design-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { goalDefinitionId } from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import type { SxProps, Theme } from "@mui/material";
import { Box, Container, Stack, TableCell, Typography } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { memo, useMemo, useState } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { Link } from "../shared/ui/link";
import { WorkersHeader } from "../shared/workers-header";
import { useAuthenticatedUser } from "./shared/auth-info-context";
import {
  FlowDefinitionsContextProvider,
  useFlowDefinitionsContext,
} from "./shared/flow-definitions-context";
import {
  FlowRunsContextProvider,
  useFlowRunsContext,
} from "./shared/flow-runs-context";
import { flowTableCellSx, flowTableRowHeight } from "./shared/flow-styles";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  VirtualizedTableSort,
} from "./shared/virtualized-table";
import { headerHeight, VirtualizedTable } from "./shared/virtualized-table";

type FieldId = "web" | "type" | "name" | "executedAt" | "closedAt";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    id: "web",
    label: "Web",
    sortable: true,
    width: "1%",
  },
  {
    id: "type",
    label: "Type",
    sortable: true,
    width: "1%",
  },
  {
    id: "name",
    label: "Name",
    sortable: true,
    width: "40%",
  },
  {
    id: "executedAt",
    label: "Started At",
    sortable: true,
    width: 150,
  },
  {
    id: "closedAt",
    label: "Finished At",
    sortable: true,
    width: 150,
  },
];

type WorkerSummary = Subtype<
  Record<FieldId, unknown>,
  {
    flowRunId: string;
    executedAt: string | null;
    closedAt: string | null;
    type: "flow" | "goal";
    web: {
      avatarUrl?: string;
      name: string;
      shortname: string;
    };
    name: string;
  }
>;

const chipSx: SxProps<Theme> = {
  border: ({ palette }) => `1px solid ${palette.gray[30]}`,
  borderRadius: 2,
  display: "inline-flex",
  py: "3px",
  px: 0.8,
};

const TableRow = memo(({ workerSummary }: { workerSummary: WorkerSummary }) => {
  const { web, flowRunId, type, name, executedAt, closedAt } = workerSummary;

  const Icon = type === "flow" ? InfinityLightIcon : BullseyeLightIcon;

  return (
    <>
      <TableCell sx={{ ...flowTableCellSx, fontSize: 13 }}>
        <Link href={`/@${web.shortname}`} noLinkStyle>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            gap={0.5}
            sx={({ palette, transitions }) => ({
              ...chipSx,
              "&:hover": {
                border: `1px solid ${palette.common.black}`,
              },
              transition: transitions.create("border"),
            })}
          >
            <Avatar src={web.avatarUrl} title={web.name} size={14} />
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 500 }}>
              {web.name}
            </Typography>
          </Stack>
        </Link>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="center"
          gap={0.5}
          sx={chipSx}
        >
          <Icon
            sx={{ fontSize: 14, fill: ({ palette }) => palette.blue[70] }}
          />
          <Typography
            component="span"
            sx={{ fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}
          >
            {type}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Link
          href={`/@${web.shortname}/${type}s/${flowRunId}`}
          sx={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {name}
        </Link>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {executedAt
            ? format(new Date(executedAt), "yyyy-MM-dd HH:mm a")
            : "Pending..."}
        </Typography>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
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
            : "Current running"}
        </Typography>
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<WorkerSummary> = (
  _index,
  row,
) => <TableRow workerSummary={row.data} />;

const WorkersPageContent = () => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    field: "name",
    direction: "asc",
  });

  const {
    query: { flowDefinitionId: definitionFilterQueryParam },
  } = useRouter();

  const { flowDefinitions } = useFlowDefinitionsContext();

  const { flowRuns: unfilteredFlowRuns } = useFlowRunsContext();

  const { authenticatedUser } = useAuthenticatedUser();

  const filteredFlowRuns = useMemo(() => {
    const flowDefinitionIds = !definitionFilterQueryParam
      ? []
      : Array.isArray(definitionFilterQueryParam)
        ? definitionFilterQueryParam
        : [definitionFilterQueryParam];

    if (flowDefinitionIds.length === 0) {
      return unfilteredFlowRuns;
    }
    return unfilteredFlowRuns.filter((run) =>
      flowDefinitionIds.includes(run.flowDefinitionId),
    );
  }, [unfilteredFlowRuns, definitionFilterQueryParam]);

  const flowRunRows = useMemo<VirtualizedTableRow<WorkerSummary>[]>(() => {
    const rowData: VirtualizedTableRow<WorkerSummary>[] = filteredFlowRuns.map(
      (flowRun) => {
        const type =
          flowRun.flowDefinitionId === goalDefinitionId ? "goal" : "flow";

        const flowDefinition = flowDefinitions.find(
          (def) => def.flowDefinitionId === flowRun.flowDefinitionId,
        );

        if (!flowDefinition) {
          throw new Error(
            `Could not find flow definition with id ${flowRun.flowDefinitionId}`,
          );
        }

        const { webId, flowRunId, executedAt, closedAt } = flowRun;

        let web: WorkerSummary["web"];
        if (webId === authenticatedUser.accountId) {
          web = {
            avatarUrl:
              authenticatedUser.hasAvatar?.imageEntity.properties[
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
              ],
            name: authenticatedUser.displayName ?? "Unknown",
            shortname: authenticatedUser.shortname ?? "unknown",
          };
        } else {
          const org = authenticatedUser.memberOf.find(
            (memberOf) => memberOf.org.accountGroupId === webId,
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
          };
        }

        return {
          id: flowRunId,
          data: {
            flowRunId,
            web,
            type,
            name: flowDefinition.name,
            closedAt: closedAt ?? null,
            executedAt: executedAt ?? null,
          },
        };
      },
    );

    return rowData.sort((a, b) => {
      const field = sort.field;
      const direction = sort.direction === "asc" ? 1 : -1;

      if (field === "web") {
        return a.data[field].name.localeCompare(b.data[field].name) * direction;
      }

      return (
        (a.data[field] ?? "").localeCompare(b.data[field] ?? "") * direction
      );
    });
  }, [authenticatedUser, flowDefinitions, filteredFlowRuns, sort]);

  const tableHeight = Math.min(
    600,
    headerHeight + flowTableRowHeight * flowRunRows.length + 2, // account for borders
  );

  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "activity",
            title: "Activity Log",
          },
        ]}
        title={{ text: "Activity Log", Icon: TerminalLightIcon }}
        subtitle="A complete record of all worker activity in your webs"
      />
      <Container sx={{ my: 4, px: 4, height: tableHeight }}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          rows={flowRunRows}
          sort={sort}
          setSort={setSort}
        />
      </Container>
    </Box>
  );
};

const WorkersPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowRunsContextProvider>
        <WorkersPageContent />
      </FlowRunsContextProvider>{" "}
    </FlowDefinitionsContextProvider>
  );
};

WorkersPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default WorkersPage;
