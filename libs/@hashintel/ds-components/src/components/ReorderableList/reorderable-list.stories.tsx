import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { ReorderableList } from "./reorderable-list";

import type { ReorderableListProps } from "./reorderable-list";
import type { Meta, StoryObj } from "@storybook/react-vite";

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
  width: "[560px]",
  maxWidth: "[100%]",
});

const label = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  marginBottom: "1.5",
});

const rowName = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.body",
  flexGrow: "1",
});

const rowType = css({
  textStyle: "sm",
  color: "fg.subtle",
});

const staticRow = css({
  display: "flex",
  alignItems: "center",
  paddingX: "2",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
});

const scrollContainer = css({
  height: "[240px]",
  overflowY: "auto",
  padding: "2",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "xl",
  backgroundColor: "bg.min",
});

const Example = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className={label}>{name}</div>
    {children}
  </div>
);

/** Reorders `rows` (objects with an `id`) to match the ids dnd reported. */
const applyOrder = <RowType extends { id: string }>(
  rows: RowType[],
  orderedIds: string[],
): RowType[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap((id) => byId.get(id) ?? []);
};

const initialPropertyRows = [
  { id: "full-name", name: "Full name", type: "Text" },
  { id: "email", name: "Email address", type: "Email" },
  { id: "website", name: "Website", type: "URL" },
  { id: "birth-date", name: "Date of birth", type: "Date" },
];

const PropertyList = (
  props: Partial<Omit<ReorderableListProps, "onChange" | "children">>,
) => {
  const [rows, setRows] = useState(initialPropertyRows);
  return (
    <ReorderableList
      {...props}
      aria-label="Visible properties"
      onChange={(orderedIds) =>
        setRows((current) => applyOrder(current, orderedIds))
      }
    >
      {rows.map((row) => (
        <ReorderableList.Item key={row.id} id={row.id} label={row.name}>
          <span className={rowName}>{row.name}</span>
          <span className={rowType}>{row.type}</span>
        </ReorderableList.Item>
      ))}
    </ReorderableList>
  );
};

const initialColumnRows = [
  { id: "entity", name: "Entity", pinned: true },
  { id: "created-at", name: "Created at", pinned: false },
  { id: "last-edited", name: "Last edited", pinned: false },
];

const ColumnsList = () => {
  const [rows, setRows] = useState(initialColumnRows);
  return (
    <ReorderableList
      aria-label="Table columns"
      onChange={(orderedIds) =>
        setRows((current) => applyOrder(current, orderedIds))
      }
    >
      {rows.map((row) => (
        <ReorderableList.Item
          key={row.id}
          id={row.id}
          label={row.name}
          disabled={row.pinned}
        >
          <span className={rowName}>{row.name}</span>
          {row.pinned && <span className={rowType}>Pinned</span>}
        </ReorderableList.Item>
      ))}
    </ReorderableList>
  );
};

const initialFieldRows = [
  { id: "display-name", name: "Display name" },
  { id: "avatar", name: "Avatar" },
  { id: "description", name: "Description" },
  { id: "last-edited", name: "Last edited" },
];

/**
 * Items interleaved with regular (non-Item) children: the two static marker
 * rows stay put while items are dragged past them, so they act as fixed
 * cutoffs between zones.
 */
const CardFieldsList = () => {
  const [rows, setRows] = useState(initialFieldRows);

  const renderRow = (row: (typeof rows)[number]) => (
    <ReorderableList.Item key={row.id} id={row.id} label={row.name}>
      <span className={rowName}>{row.name}</span>
    </ReorderableList.Item>
  );

  return (
    <ReorderableList
      aria-label="Entity card fields"
      onChange={(orderedIds) =>
        setRows((current) => applyOrder(current, orderedIds))
      }
    >
      {rows.slice(0, 2).map(renderRow)}
      <li className={staticRow}>Fields above appear on entity card previews</li>
      {rows.slice(2, 3).map(renderRow)}
      <li className={staticRow}>
        Fields below show only on the expanded entity
      </li>
      {rows.slice(3).map(renderRow)}
    </ReorderableList>
  );
};

const initialStepRows = [
  { id: "fetch-sources", name: "Fetch sources" },
  { id: "deduplicate", name: "Deduplicate records" },
  { id: "infer-entities", name: "Infer entities" },
  { id: "match-types", name: "Match entity types" },
  { id: "map-properties", name: "Map properties" },
  { id: "validate", name: "Validate against schema" },
  { id: "resolve-conflicts", name: "Resolve conflicts" },
  { id: "write-graph", name: "Write to graph" },
  { id: "notify", name: "Notify watchers" },
];

/**
 * Inside a fixed-height scrollable container: dragging a row toward the
 * container's edge autoscrolls the list so rows can move beyond the
 * initially visible ones.
 */
const StepsList = () => {
  const [rows, setRows] = useState(initialStepRows);
  return (
    <div className={scrollContainer}>
      <ReorderableList
        aria-label="Flow steps"
        onChange={(orderedIds) =>
          setRows((current) => applyOrder(current, orderedIds))
        }
      >
        {rows.map((row, index) => (
          <ReorderableList.Item key={row.id} id={row.id} label={row.name}>
            <span className={rowName}>{row.name}</span>
            <span className={rowType}>Step {index + 1}</span>
          </ReorderableList.Item>
        ))}
      </ReorderableList>
    </div>
  );
};

const meta = {
  title: "Components/ReorderableList",
  component: ReorderableList,
} satisfies Meta;

export default meta;

type Story = StoryObj;

/**
 * Every example in one place. Drag a row by its handle, or focus the handle
 * and press Space, then the arrow keys, to reorder with the keyboard.
 * `card` frames each row; `plain` leaves row styling to the content.
 * Disabling the list freezes the whole order, while disabling a single item
 * pins that row and leaves the rest draggable.
 */
export const Default: Story = {
  render: () => (
    <div className={column}>
      <Example name="Card (default)">
        <PropertyList />
      </Example>

      <Example name="Plain">
        <PropertyList variant="plain" />
      </Example>

      <Example name="Disabled list">
        <PropertyList disabled />
      </Example>

      <Example name="Disabled item">
        <ColumnsList />
      </Example>

      <Example name="Static rows in between">
        <CardFieldsList />
      </Example>

      <Example name="In a scrollable container">
        <StepsList />
      </Example>
    </div>
  ),
};
