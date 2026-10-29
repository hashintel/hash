import { Box, Container, Stack, TableCell, Typography } from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import { memo, useMemo, useState } from "react";

import { Chip, InfinityLightIcon } from "@hashintel/design-system";
import { isGoalFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";
import { generateFlowDefinitionPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";

import { useGetOwnerForEntity } from "../components/hooks/use-get-owner-for-entity";
import { getLayoutWithSidebar } from "../shared/layout";
import { Link } from "../shared/ui/link";
import { WorkersHeader } from "../shared/workers-header";
import { useFlowDefinitionsContext } from "./shared/flow-definitions-context";
import { FlowDefinitionsContextProvider } from "./shared/flow-definitions-context-provider";
import { useFlowRunsContext } from "./shared/flow-runs-context";
import { FlowRunsContextProvider } from "./shared/flow-runs-context-provider";
import {
  flowTableCellSx,
  flowTableRowHeight,
  FlowTableWebChip,
} from "./shared/flow-tables";
import { VirtualizedTable } from "./shared/virtualized-table";
import { virtualizedTableHeaderHeight } from "./shared/virtualized-table/header";

import type { NextPageWithLayout } from "../shared/layout";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "./shared/virtualized-table";
import type { VirtualizedTableSort } from "./shared/virtualized-table/header/sort";
import type { EntityId } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";

type FieldId = "web" | "name" | "description" | "lastRunStartedAt";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    id: "web",
    label: "Web",
    sortable: true,
    width: 120,
  },
  {
    id: "name",
    label: "Name",
    sortable: true,
    width: "40%",
  },
  {
    id: "description",
    label: "Description",
    sortable: true,
    width: "60%",
  },
  {
    id: "lastRunStartedAt",
    label: "Last run",
    sortable: true,
    width: 150,
  },
];

type FlowSummary = Subtype<
  Record<FieldId, unknown>,
  {
    web: {
      avatarUrl?: string;
      name: string;
      shortname: string;
      isOrg: boolean;
    };
    name: string;
    flowDefinitionEntityId: EntityId;
    description: string;
    /** False for a flow saved before it was finished, which can't run yet. */
    isValid: boolean;
    lastRunStartedAt: string | null;
  }
>;

const TableRow = memo(({ flowSummary }: { flowSummary: FlowSummary }) => {
  const {
    web,
    name,
    flowDefinitionEntityId,
    description,
    isValid,
    lastRunStartedAt,
  } = flowSummary;

  return (
    <>
      <TableCell sx={{ ...flowTableCellSx, fontSize: 13 }}>
        <FlowTableWebChip {...web} />
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Link
            href={generateFlowDefinitionPath({
              shortname: web.shortname,
              flowDefinitionEntityId,
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
          {!isValid && <Chip label="Not valid" size="xs" color="red" />}
        </Stack>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {description}
        </Typography>
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {lastRunStartedAt
            ? `${formatDistanceToNowStrict(new Date(lastRunStartedAt))} ago`
            : "Never"}
        </Typography>
      </TableCell>
    </>
  );
});

const createRowContent: CreateVirtualizedRowContentFn<FlowSummary> = (
  _index,
  row,
) => <TableRow flowSummary={row.data} />;

const FlowsPageContent = () => {
  const [sort, setSort] = useState<VirtualizedTableSort<FieldId>>({
    fieldId: "name",
    direction: "asc",
  });

  const { flowDefinitions: allFlowDefinitions } = useFlowDefinitionsContext();

  const { flowRuns } = useFlowRunsContext();

  const getOwner = useGetOwnerForEntity();

  const flowDefinitionRows = useMemo<VirtualizedTableRow<FlowSummary>[]>(() => {
    const rowData: VirtualizedTableRow<FlowSummary>[] = allFlowDefinitions
      .filter(
        ({ flowDefinitionEntityId }) =>
          !isGoalFlowDefinitionEntityId(flowDefinitionEntityId),
      )
      .map(({ flowDefinitionEntityId, name, description, flowDefinition }) => {
        let lastRunStartedAt = null;
        for (const flowRun of flowRuns) {
          if (
            flowRun.flowDefinitionEntityId === flowDefinitionEntityId &&
            (!lastRunStartedAt || flowRun.startedAt > lastRunStartedAt)
          ) {
            lastRunStartedAt = flowRun.startedAt;
          }
        }

        return {
          id: flowDefinitionEntityId,
          data: {
            web: {
              avatarUrl: "/hash-logo-black.png",
              name: "HASH",
              shortname: getOwner({ entityId: flowDefinitionEntityId })
                .shortname,
              isOrg: true,
            },
            name,
            flowDefinitionEntityId,
            description,
            isValid: flowDefinition !== null,
            lastRunStartedAt,
          },
        };
      });

    return rowData.sort((a, b) => {
      const field = sort.fieldId;
      const direction = sort.direction === "asc" ? 1 : -1;

      if (field === "web") {
        return a.data[field].name.localeCompare(b.data[field].name) * direction;
      }

      return (
        (a.data[field] ?? "").localeCompare(b.data[field] ?? "") * direction
      );
    });
  }, [allFlowDefinitions, flowRuns, getOwner, sort]);

  const tableHeight = Math.min(
    600,
    virtualizedTableHeaderHeight +
      flowTableRowHeight * flowDefinitionRows.length +
      2, // account for borders
  );

  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "flows",
            title: "Flows",
          },
        ]}
        title={{ text: "Flows", Icon: InfinityLightIcon }}
        subtitle="Processes that workers can monitor and manage"
      />
      <Container sx={{ my: 4, px: 4, height: tableHeight }}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          rows={flowDefinitionRows}
          sort={sort}
          setSort={setSort}
        />
      </Container>
    </Box>
  );
};

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider selectedFlowDefinitionEntityId={null}>
      <FlowRunsContextProvider selectedFlowRunEntityId={null}>
        <FlowsPageContent />
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
