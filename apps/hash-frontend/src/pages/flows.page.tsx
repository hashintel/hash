import { Box, TableCell, Typography } from "@mui/material";

import { BoltLightIcon } from "../shared/icons/bolt-light-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import {
  FlowDefinitionsContextProvider,
  useFlowDefinitionsContext,
} from "./shared/flow-definitions-context";
import { TopContextBar } from "./shared/top-context-bar";
import {
  CreateVirtualizedRowContentFn,
  VirtualizedTable,
  VirtualizedTableColumn,
  VirtualizedTableRow,
  type VirtualizedTableSort,
} from "./shared/virtualized-table";
import { memo, useMemo, useState } from "react";
import { format } from "date-fns";
import { Subtype } from "@local/advanced-types/subtype";
import { Avatar } from "@hashintel/design-system";
import { Link } from "../shared/ui/link";

type FieldId = "web" | "name" | "description" | "lastRunScheduledAt";

const columns: VirtualizedTableColumn<FieldId>[] = [
  {
    id: "web",
    label: "Web",
    sortable: true,
    width: 100,
  },
  {
    id: "name",
    label: "Name",
    sortable: true,
    width: "50%",
  },
  {
    id: "description",
    label: "Description",
    sortable: true,
    width: "50%",
  },
  {
    id: "lastRunScheduledAt",
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
    };
    name: string;
    description: string;
    lastRunScheduledAt: string | null;
  }
>;

const TableRow = memo(({ flowSummary }: { flowSummary: FlowSummary }) => {
  const { web, name, description, lastRunScheduledAt } = flowSummary;

  return (
    <>
      <TableCell sx={{ fontSize: 13 }}>
        {web.avatarUrl && (
          <Avatar
            src={web.avatarUrl}
            size={24}
            sx={{
              border: "none",
              flexShrink: 0,
            }}
          />
        )}
        {web.name}
      </TableCell>
      <TableCell>
        <Link
          href="#"
          sx={{ fontSize: 14, fontWeight: 600, textDecoration: "none" }}
        >
          {name}
        </Link>
      </TableCell>
      <TableCell>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {description}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography
          sx={{ fontSize: 13, color: ({ palette }) => palette.gray[70] }}
        >
          {lastRunScheduledAt
            ? format(new Date(lastRunScheduledAt), "yyyy-MM-dd")
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
    field: "name",
    direction: "asc",
  });

  const { flowDefinitions } = useFlowDefinitionsContext();

  const flowDefinitionRows = useMemo<VirtualizedTableRow<FlowSummary>[]>(() => {
    const rowData: VirtualizedTableRow<FlowSummary>[] = flowDefinitions.map(
      (flowDefinition) => ({
        id: flowDefinition.flowDefinitionId,
        data: {
          web: { name: "HASH" },
          name: flowDefinition.name,
          description: flowDefinition.description,
          lastRunScheduledAt: null,
        },
      }),
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
  }, [flowDefinitions, setSort, sort]);

  return (
    <FlowDefinitionsContextProvider>
      <Box>
        <TopContextBar
          crumbs={[
            {
              href: "/workers",
              id: "workers",
              icon: <BoltLightIcon />,
              title: "Workers",
            },
            {
              icon: null,
              id: "flows",
              title: "Flows",
            },
          ]}
          sx={({ palette }) => ({
            background: palette.gray[5],
            borderBottom: `1px solid ${palette.gray[20]}`,
          })}
        />
      </Box>
      <Box my={4} px={4} height={400}>
        <VirtualizedTable
          columns={columns}
          createRowContent={createRowContent}
          rows={flowDefinitionRows}
          sort={sort}
          setSort={setSort}
        />
      </Box>
    </FlowDefinitionsContextProvider>
  );
};

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowsPageContent />
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
