import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { SpreadsheetColumn } from "./spreadsheet";
import { Spreadsheet } from "./spreadsheet";

const meta = {
  title: "Components / Spreadsheet",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const COLUMNS_3: SpreadsheetColumn[] = [
  { id: "x", name: "x" },
  { id: "y", name: "y" },
  { id: "z", name: "z" },
];

const SAMPLE_DATA: number[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

const Container = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 400, height: 300 }}>{children}</div>
);

const InteractiveSpreadsheet = ({
  columns,
  initialData,
  readOnly,
}: {
  columns: SpreadsheetColumn[];
  initialData: number[][];
  readOnly?: boolean;
}) => {
  const [data, setData] = useState(initialData);
  return (
    <Container>
      <Spreadsheet
        columns={columns}
        data={data}
        onChange={readOnly ? undefined : setData}
      />
    </Container>
  );
};

export const Default: Story = {
  name: "Default (editable)",
  render: () => (
    <InteractiveSpreadsheet columns={COLUMNS_3} initialData={SAMPLE_DATA} />
  ),
};

export const ReadOnly: Story = {
  name: "Read-only",
  render: () => (
    <InteractiveSpreadsheet
      columns={COLUMNS_3}
      initialData={SAMPLE_DATA}
      readOnly
    />
  ),
};

export const Empty: Story = {
  name: "Empty (phantom row only)",
  render: () => <InteractiveSpreadsheet columns={COLUMNS_3} initialData={[]} />,
};

export const SingleColumn: Story = {
  name: "Single column",
  render: () => (
    <InteractiveSpreadsheet
      columns={[{ id: "count", name: "count" }]}
      initialData={[[10], [20], [30]]}
    />
  ),
};

export const ManyRows: Story = {
  name: "Many rows (scrolling)",
  render: () => (
    <InteractiveSpreadsheet
      columns={COLUMNS_3}
      initialData={Array.from({ length: 25 }, (_, i) => [
        i + 1,
        (i + 1) * 10,
        (i + 1) * 100,
      ])}
    />
  ),
};
