import { InfinityLightIcon } from "@hashintel/design-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { generateFlowDefinitionPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import { Box, Container, TableCell, Typography } from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import { memo, useMemo, useState } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { Link } from "../shared/ui/link";
import { WorkersHeader } from "../shared/workers-header";
import {
  FlowDefinitionsContextProvider,
  useFlowDefinitionsContext,
} from "./shared/flow-definitions-context";
import {
  FlowRunsContextProvider,
  useFlowRunsContext,
} from "./shared/flow-runs-context";
import {
  flowTableCellSx,
  flowTableRowHeight,
  FlowTableWebChip,
} from "./shared/flow-tables";
import type {
  CreateVirtualizedRowContentFn,
  VirtualizedTableColumn,
  VirtualizedTableRow,
} from "./shared/virtualized-table";
import { VirtualizedTable } from "./shared/virtualized-table";
import { virtualizedTableHeaderHeight } from "./shared/virtualized-table/header";
import type { VirtualizedTableSort } from "./shared/virtualized-table/header/sort";

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
    };
    name: string;
    uuid: string;
    description: string;
    lastRunStartedAt: string | null;
  }
>;

const TableRow = memo(({ flowSummary }: { flowSummary: FlowSummary }) => {
  const { web, name, uuid, description, lastRunStartedAt } = flowSummary;

  return (
    <>
      <TableCell sx={{ ...flowTableCellSx, fontSize: 13 }}>
        <FlowTableWebChip {...web} />
      </TableCell>
      <TableCell sx={flowTableCellSx}>
        <Link
          href={generateFlowDefinitionPath({
            shortname: web.shortname,
            flowDefinitionId: uuid,
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

  const flowDefinitionRows = useMemo<VirtualizedTableRow<FlowSummary>[]>(() => {
    const rowData: VirtualizedTableRow<FlowSummary>[] = allFlowDefinitions
      .filter((def) => !goalFlowDefinitionIds.includes(def.flowDefinitionId))
      .map((flowDefinition) => {
        let lastRunStartedAt = null;
        for (const flowRun of flowRuns) {
          if (
            flowRun.flowDefinitionId === flowDefinition.flowDefinitionId &&
            (!lastRunStartedAt || flowRun.startedAt > lastRunStartedAt)
          ) {
            lastRunStartedAt = flowRun.startedAt;
          }
        }

        return {
          id: flowDefinition.flowDefinitionId,
          data: {
            web: {
              avatarUrl: "/hash-logo-black.png",
              name: "HASH",
              shortname: "hash",
            },
            name: flowDefinition.name,
            /**
             * Flow definitions will have their own uuid once we start storing them in the db, this is a placeholder
             * while we only have hardcoded definitions
             */
            uuid: flowDefinition.flowDefinitionId,
            description: flowDefinition.description,
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
  }, [allFlowDefinitions, flowRuns, sort]);

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
        subtitle="Pre-defined sequences of actions run by workers on your behalf"
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
    <FlowDefinitionsContextProvider selectedFlowDefinitionId={null}>
      <FlowRunsContextProvider selectedFlowRunId={null}>
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
