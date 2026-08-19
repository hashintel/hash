import { useState } from "react";

import { SortMenu, type SortDirection, type Sorter } from "./sort-menu";

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

const Example = ({
  label,
  initialValue,
  saveSortId,
  containerMaxWidth,
  searchable,
  renderTrigger,
}: {
  label: string;
  initialValue?: Value;
  saveSortId?: string;
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
      saveSortId={saveSortId}
      searchable={searchable}
      renderTrigger={renderTrigger}
    />
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ width: 280, fontSize: 13, color: "#667" }}>{label}</span>
      {containerMaxWidth === undefined ? (
        menu
      ) : (
        <div style={{ maxWidth: containerMaxWidth }}>{menu}</div>
      )}
    </div>
  );
};

export const Default: Story = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 16,
    }}
  >
    <Example label="No value selected" />
    <Example
      label="Bidirectional sort selected"
      initialValue={{ sortKey: "name", direction: "ASCENDING" }}
    />
    <Example
      label="Single-direction sort selected"
      initialValue={{ sortKey: "updatedAt", direction: "DESCENDING" }}
    />
    <Example
      label="Direction-less sort selected"
      initialValue={{ sortKey: "relevance", direction: "ASCENDING" }}
    />
    <Example
      label="Long sort selected, 200px max-width container"
      initialValue={{
        sortKey: "inheritanceDepthScore",
        direction: "ASCENDING",
      }}
      containerMaxWidth={200}
    />
    <Example
      label="No value selected, persisted (saveSortId)"
      saveSortId="sort-story"
    />
    <Example label="Searchable" searchable />
    <Example label="Icon trigger, no value selected" renderTrigger="icon" />
    <Example
      label="Icon trigger, sort selected"
      renderTrigger="icon"
      initialValue={{ sortKey: "name", direction: "ASCENDING" }}
    />
    <Example
      label="Custom trigger (render function)"
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
  </div>
);
