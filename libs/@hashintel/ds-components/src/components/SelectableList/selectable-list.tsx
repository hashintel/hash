/* eslint-disable @typescript-eslint/no-use-before-define */

import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { useMemo } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { isEmptyString } from "../../util/string";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  checkIconSizeMap,
  indentUnitPx,
  styles,
} from "./selectable-list.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { ExclusifyUnion } from "type-fest";

export type Item = {
  id: string;

  text: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconName;
  loading?: boolean;

  indent?: number;
  disabled?: boolean;
  tone?: "neutral" | "brand" | "error";
  selectedStyle?: "none" | "tick" | "checkbox" | "radio" | "highlight";
} & ExclusifyUnion<
  | {
      href: string;
      target?: "_blank";
    }
  | {
      onClick: (id: string) => void;
    }
  | {
      nestedItems?: ItemOrGroup<Item>;
    }
>;

export type ItemOrGroup<ItemType> =
  | ItemType
  | {
      id: string;
      label: React.ReactNode;
      items: ItemType[];
    };

const isGroup = (
  entry: ItemOrGroup<Item>,
): entry is Extract<ItemOrGroup<Item>, { items: Item[] }> => "items" in entry;

const SelectionIndicator = ({
  style,
  selected,
  classes,
  size,
}: {
  style: NonNullable<Item["selectedStyle"]>;
  selected: boolean;
  classes: ReturnType<typeof styles>;
  size: FormInputSize;
}) => {
  if (style === "none" || style === "highlight") {
    return null;
  }

  if (style === "tick") {
    return (
      <span className={classes.indicatorBox} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  if (style === "checkbox") {
    return (
      <span className={classes.checkboxControl} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  return (
    <span className={classes.radioControl} aria-hidden="true">
      {selected ? <span className={classes.radioDot} /> : null}
    </span>
  );
};

const ItemBody = ({
  item,
  size,
  isSelected,
  classes,
}: {
  item: Item;
  size: FormInputSize;
  isSelected: boolean;
  classes: ReturnType<typeof styles>;
}) => {
  const selectedStyle = item.selectedStyle ?? "tick";
  const indent = item.indent ?? 0;

  return (
    <>
      {indent > 0 && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: `${indent * indentUnitPx[size]}px`,
            flexShrink: 0,
          }}
        />
      )}
      <SelectionIndicator
        style={selectedStyle}
        selected={isSelected}
        classes={classes}
        size={size}
      />
      {item.icon && <Icon name={item.icon} size={size} />}
      <span className={classes.textColumn}>
        <span className={classes.text}>{item.text}</span>
        {item.description !== undefined && item.description !== null && (
          <span className={classes.description}>{item.description}</span>
        )}
      </span>
      {item.loading && <LoadingSpinner size={size} />}
      {item.nestedItems && (
        <Icon name="chevronRight" size={size} aria-hidden="true" />
      )}
    </>
  );
};

type RenderCtx = {
  size: FormInputSize;
  selectedSet: Set<string>;
  contentClassName: string | undefined;
};

const ItemRow = ({ item, ctx }: { item: Item; ctx: RenderCtx }) => {
  const isSelected = ctx.selectedSet.has(item.id);
  const selectedStyle = item.selectedStyle ?? "tick";
  const highlighted = isSelected && selectedStyle === "highlight";

  const classes = styles({
    size: ctx.size,
    tone: item.tone,
    highlighted,
    selected: isSelected,
  });

  const body = (
    <ItemBody
      item={item}
      size={ctx.size}
      isSelected={isSelected}
      classes={classes}
    />
  );

  if (item.nestedItems) {
    return (
      <Menu.Root closeOnSelect={false}>
        <Menu.TriggerItem
          className={classes.item}
          data-selected={isSelected || undefined}
        >
          {body}
        </Menu.TriggerItem>
        <Portal>
          <Menu.Positioner>
            <Menu.Content className={ctx.contentClassName}>
              {renderEntry(item.nestedItems, ctx)}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    );
  }

  if ("href" in item && item.href) {
    return (
      <Menu.Item value={item.id} disabled={item.disabled} asChild>
        <a
          href={item.href}
          target={item.target}
          className={classes.item}
          data-selected={isSelected || undefined}
        >
          {body}
        </a>
      </Menu.Item>
    );
  }

  const handleSelect = () => {
    if ("onClick" in item && item.onClick) {
      item.onClick(item.id);
    }
  };

  return (
    <Menu.Item
      value={item.id}
      disabled={item.disabled}
      onSelect={handleSelect}
      className={classes.item}
      data-selected={isSelected || undefined}
    >
      {body}
    </Menu.Item>
  );
};

const renderEntry = (
  entry: ItemOrGroup<Item>,
  ctx: RenderCtx,
): React.ReactNode => {
  if (isGroup(entry)) {
    const groupClasses = styles({ size: ctx.size });
    return (
      <Menu.ItemGroup
        key={entry.id}
        id={entry.id}
        className={groupClasses.group}
      >
        {(typeof entry.label === "string"
          ? !isEmptyString(entry.label)
          : entry.label !== undefined && entry.label !== null) && (
          <Menu.ItemGroupLabel className={groupClasses.groupLabel}>
            {entry.label}
          </Menu.ItemGroupLabel>
        )}
        {entry.items.map((child) => (
          <ItemRow key={child.id} item={child} ctx={ctx} />
        ))}
      </Menu.ItemGroup>
    );
  }

  return <ItemRow key={entry.id} item={entry} ctx={ctx} />;
};

export const SelectableList = ({
  className,
  items = [],
  selected,
  size = "md",
  onHighlight,
  emptyState,
}: {
  className?: string;
  items?: Array<ItemOrGroup<Item>>;
  size?: FormInputSize;
  selected?: string[] | Set<string>;
  onHighlight?: (id: string) => void;
  emptyState?: React.ReactNode;
}) => {
  const selectedSet = useMemo(() => new Set(selected ?? []), [selected]);
  const classes = styles({ size });

  const isEmpty = items.length === 0;
  if (isEmpty && !emptyState) {
    return null;
  }

  const ctx = {
    size,
    selectedSet,
    contentClassName: classes.content,
  };

  return (
    <Menu.Root
      open
      closeOnSelect={false}
      composite
      onHighlightChange={(details) => {
        if (details.highlightedValue) {
          onHighlight?.(details.highlightedValue);
        }
      }}
    >
      <Menu.Content className={cx(classes.content, className)}>
        {isEmpty ? emptyState : items.map((item) => renderEntry(item, ctx))}
      </Menu.Content>
    </Menu.Root>
  );
};
