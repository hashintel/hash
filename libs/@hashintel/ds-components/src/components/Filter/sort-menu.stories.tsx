import { useState } from "react";

import { SortMenu } from "./sort-menu";
import { type SortDirection, type Sorter } from "./sort-menu-util";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/SortMenu",
} satisfies StoryDefault;

const sorters = [
  { name: "Name", sortKey: "name" },
  {
    name: "Created at",
    sortKey: "createdAt",
    directionsAvailable: "ascending",
  },
  {
    name: "Updated at",
    sortKey: "updatedAt",
    directionsAvailable: "descending",
  },
  { name: "Relevance", sortKey: "relevance", directionsAvailable: "none" },
  {
    name: "Aggregated cross-workspace entity type inheritance depth score",
    sortKey: "inheritanceDepthScore",
    directionsAvailable: "both",
  },
] as const;

type Key = (typeof sorters)[number]["sortKey"];
type Value = { sortKey: Key; direction: SortDirection };

const labelStyle = { fontSize: 13, color: "#667" } as const;

const Example = ({
  columnLabel,
  initialValue,
  containerMaxWidth,
  searchable,
  renderTrigger,
}: {
  /** Shown above the menu; used for columns within a multi-example row */
  columnLabel?: string;
  initialValue?: Value;
  /** Wraps the menu in a max-width container to exercise trigger overflow */
  containerMaxWidth?: number;
  searchable?: boolean;
  renderTrigger?:
    | "default"
    | "icon"
    | ((
        sorter: Sorter<Key> | undefined,
        direction: SortDirection | undefined,
      ) => React.ReactElement);
}) => {
  const [value, setValue] = useState<Value | undefined>(initialValue);

  const menu = (
    <SortMenu
      items={sorters}
      value={value}
      onChange={(sortKey, direction) => setValue({ sortKey, direction })}
      searchable={searchable}
      renderTrigger={renderTrigger}
    />
  );

  const content =
    containerMaxWidth === undefined ? (
      menu
    ) : (
      <div style={{ maxWidth: containerMaxWidth }}>{menu}</div>
    );

  if (columnLabel === undefined) {
    return content;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      <span style={labelStyle}>{columnLabel}</span>
      {content}
    </div>
  );
};

// Each row is a (label cell, examples cell) pair in the story's 2-column
// grid, so the label column sizes to the widest label. Bottom-aligning
// keeps the row label level with the menu row even when the examples carry
// column labels above them.
const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <>
    <span style={{ ...labelStyle, paddingBottom: 6, textAlign: "right" }}>
      {label}
    </span>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
      {children}
    </div>
  </>
);

export const Default: Story = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "max-content max-content",
      columnGap: 10,
      rowGap: 24,
      alignItems: "end",
    }}
  >
    <Row label="Default trigger">
      <Example columnLabel="No value selected" />
      <Example
        columnLabel="Bidirectional sort"
        initialValue={{ sortKey: "name", direction: "ASCENDING" }}
      />
      <Example
        columnLabel="Single-direction sort"
        initialValue={{ sortKey: "updatedAt", direction: "DESCENDING" }}
      />
      <Example
        columnLabel="Direction-less sort"
        initialValue={{ sortKey: "relevance", direction: "ASCENDING" }}
      />
    </Row>
    <Row label="Icon trigger">
      <Example columnLabel="No value selected" renderTrigger="icon" />
      <Example
        columnLabel="Sort selected"
        renderTrigger="icon"
        initialValue={{ sortKey: "name", direction: "ASCENDING" }}
      />
    </Row>
    <Row label="Custom trigger">
      <Example
        initialValue={{ sortKey: "name", direction: "ASCENDING" }}
        renderTrigger={(sorter, direction) => (
          <button
            type="button"
            style={{
              font: "inherit",
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px dashed #99a",
              background: "none",
              cursor: "pointer",
            }}
          >
            {sorter ? `Sorted by ${sorter.name}` : "Sort"}
            {direction ? (direction === "ASCENDING" ? " ↑" : " ↓") : null}
          </button>
        )}
      />
    </Row>
    <Row label="Searchable">
      <Example searchable />
    </Row>
    <Row label="Overflow">
      <Example
        initialValue={{
          sortKey: "inheritanceDepthScore",
          direction: "ASCENDING",
        }}
        containerMaxWidth={200}
      />
    </Row>
  </div>
);
