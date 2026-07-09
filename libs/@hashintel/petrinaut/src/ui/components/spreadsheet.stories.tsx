import { useState } from "react";

import { Spreadsheet } from "./spreadsheet";

import type { SpreadsheetCellValue, SpreadsheetColumn } from "./spreadsheet";
import type { Meta, StoryObj } from "@storybook/react-vite";

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

const SAMPLE_DATA: SpreadsheetCellValue[][] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

const TYPED_COLUMNS: SpreadsheetColumn[] = [
  { id: "amount", name: "amount", type: "real" },
  { id: "count", name: "count", type: "integer" },
  { id: "active", name: "active", type: "boolean" },
  { id: "id", name: "id", type: "uuid" },
  { id: "label", name: "label", type: "string" },
];

const TYPED_DATA: SpreadsheetCellValue[][] = [
  [1.25, 3, true, 0x45f588b605384fc992071ddfd7f65b64n, "alpha"],
  [0.5, 1, false, 0xc0ffee0012344abc8defdeadbeef0042n, "beta"],
  [9.75, 7, true, 0n, ""],
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
  initialData: SpreadsheetCellValue[][];
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

export const TypedColumns: Story = {
  name: "Typed columns (real / integer / boolean / uuid / string)",
  render: () => (
    <div style={{ width: 640, height: 300 }}>
      <InteractiveSpreadsheet
        columns={TYPED_COLUMNS}
        initialData={TYPED_DATA}
      />
    </div>
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
