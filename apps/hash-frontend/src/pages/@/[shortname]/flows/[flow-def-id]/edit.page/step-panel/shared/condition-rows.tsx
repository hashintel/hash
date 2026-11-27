import { useState } from "react";

import {
  Button,
  FilterGroup,
  Form,
  Menu,
  Select,
  SelectableListSearch,
  TextArea,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { IconName, MenuItem } from "@hashintel/ds-components";
import type { ReactElement, ReactNode } from "react";

export type Join = "all" | "any";

const joinWords: Record<Join, string> = { all: "and", any: "or" };

/* Each box around a chip can shrink, so a long chip truncates inside the panel. */
const chipGroup = css({ flex: "1", minWidth: "0" });
const chipLine = css({ width: "full", minWidth: "0" });
const note = css({ textStyle: "sm", color: "fg.subtle" });
const unreadable = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2",
});

/**
 * A condition's rows: "Where" beside the first chip, the "and" or "or" every row shares beside each later one, and the
 * add button last. Each row is a field of the enclosing `Form.Section`, so its label lines up with the other inputs'.
 * As a `legend`, an inline field's label renders as a span, so it can hold the join's select.
 */
export const ConditionRows = ({
  rows,
  join,
  add,
  errors,
  onJoinChange,
}: {
  /** Each chip, by a key kept for its row. */
  rows: { key: string | number; chip: ReactNode }[];
  join: Join;
  /** The add button, or `null` when no row can be added. */
  add: ReactNode;
  errors: string[];
  onJoinChange: (join: Join) => void;
}) => {
  const joinLabel = (
    <Select<Join>
      size="sm"
      width="fullWidth"
      required
      items={[
        { value: "all", text: joinWords.all },
        { value: "any", text: joinWords.any },
      ]}
      value={join}
      aria-label="Join conditions with"
      onChange={onJoinChange}
    />
  );

  const fieldErrors = errors.length > 0 ? errors : undefined;

  return (
    <>
      {rows.map((row, index) => (
        <Form.Field
          key={row.key}
          layout="inline"
          as="legend"
          label={index === 0 ? "Where" : joinLabel}
          errors={
            add === null && index === rows.length - 1 ? fieldErrors : undefined
          }
        >
          {/* A group of its own, so a chip left without a value is dismissed when focus leaves its row. */}
          <FilterGroup dismissAbandoned className={chipGroup}>
            <div className={chipLine}>{row.chip}</div>
          </FilterGroup>
        </Form.Field>
      ))}
      {add !== null && (
        <Form.Field
          layout="inline"
          as="legend"
          label={rows.length === 0 ? "Where" : ""}
          errors={fieldErrors}
        >
          {add}
        </Form.Field>
      )}
    </>
  );
};

/** Add filter's menu: what a new row can check, with a search. */
export const AddFilterMenu = <Option extends { key: string; title: string }>({
  options,
  getIcon,
  emptyText,
  trigger = <FilterGroup.AddFilter renderAs="plusLabel" />,
  onPick,
}: {
  options: Option[];
  getIcon: (option: Option) => IconName;
  /** Shown when there's nothing to check. */
  emptyText: string;
  /** What opens the menu, Add filter unless given. */
  trigger?: ReactElement;
  onPick: (option: Option) => void;
}) => {
  const [query, setQuery] = useState("");

  const matching = options.filter(({ title }) =>
    title.toLowerCase().includes(query.toLowerCase()),
  );

  const items: MenuItem[] =
    matching.length > 0
      ? matching.map((option) => ({
          id: option.key,
          text: option.title,
          icon: getIcon(option),
          onClick: () => onPick(option),
        }))
      : [
          {
            id: "none",
            text: options.length === 0 ? emptyText : "No matching properties",
            disabled: true,
            onClick: () => {},
          },
        ];

  return (
    <Menu
      items={items}
      header={
        <SelectableListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search properties"
          aria-label="Search properties"
        />
      }
      onOpen={(open) => {
        if (!open) {
          setQuery("");
        }
      }}
      trigger={trigger}
    />
  );
};

/** A saved value the builder can't show, read-only as it runs, with a button to start a new one. */
export const UnreadableCondition = ({
  label,
  value,
  note: noteText,
  resetLabel,
  errors,
  onReset,
}: {
  label: string;
  value: unknown;
  note: string;
  resetLabel: string;
  errors: string[];
  onReset: () => void;
}) => (
  <Form.Field
    layout="inline"
    label={label}
    errors={errors.length > 0 ? errors : undefined}
  >
    <div className={unreadable}>
      <span className={note}>{noteText}</span>
      <TextArea
        readonly
        value={JSON.stringify(value)}
        aria-label={label}
        onChange={() => {}}
      />
      <Button size="sm" variant="subtle" onClick={onReset}>
        {resetLabel}
      </Button>
    </div>
  </Form.Field>
);
