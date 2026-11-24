import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { type FormInputSize, formInputSizes } from "../../util/form-shared";
import { Button } from "../Button/button";
import { HelpTooltip } from "../HelpTooltip/help-tooltip";
import {
  type TabItem,
  TabList,
  type TabListProps,
  Tabs,
  type TabsSize,
} from "./tabs";

const tabSizes = formInputSizes.filter(
  (size): size is TabsSize => size !== "xxs",
);

import type { Meta, StoryObj } from "@storybook/react-vite";

const textItems: TabItem[] = [
  { id: "overview", children: "Overview" },
  { id: "entities", children: "Entities" },
  { id: "history", children: "History" },
];

const manyItems: TabItem[] = [
  { id: "overview", children: "Overview" },
  { id: "entities", children: "Entities" },
  { id: "types", children: "Types" },
  { id: "workers", children: "Workers" },
  { id: "integrations", children: "Integrations" },
  { id: "settings", children: "Settings" },
];

const kitchenSinkItems: TabItem[] = [
  { id: "overview", children: "Overview" },
  { id: "entities", children: "Entities", disabled: true },
  { id: "link", children: "Link", href: "#link" },
  { id: "history", children: "History" },
];

const alignmentItems: TabItem[] = [
  { id: "tall", children: "Tall", className: css({ minHeight: "[64px]" }) },
  { id: "top", children: "Top", align: "top" },
  { id: "center", children: "Center", align: "center" },
  { id: "bottom", children: "Bottom", align: "bottom" },
];

// In a vertical list the cross axis is horizontal, so a wide sibling (rather
// than a tall one) gives the aligned items room to move
const verticalAlignmentItems: TabItem[] = [
  { id: "wide", children: "Wide tab", className: css({ minWidth: "[140px]" }) },
  { id: "top", children: "Top", align: "top" },
  { id: "center", children: "Center", align: "center" },
  { id: "bottom", children: "Bottom", align: "bottom" },
];

const helpTooltipItems: TabItem[] = [
  {
    id: "overview",
    children: (
      <>
        Overview
        <HelpTooltip content="A summary of the web's activity" />
      </>
    ),
  },
  {
    id: "entities",
    children: (
      <>
        Entities
        <HelpTooltip content="Every entity in this web" />
      </>
    ),
  },
  {
    id: "history",
    children: (
      <>
        History
        <HelpTooltip content="Changes made over time" />
      </>
    ),
  },
];

const exampleActions = (size: FormInputSize = "xs") => (
  <>
    <Button size={size} variant="ghost" iconName="plus">
      New
    </Button>
    <Button size={size} variant="ghost" iconName="ellipsis" tooltip="More" />
  </>
);

const ControlledTabs = ({
  items,
  defaultValue,
  withActions,
  actionsSize,
  ...listProps
}: Omit<TabListProps, "selected" | "actions"> & {
  defaultValue?: string;
  withActions?: boolean;
  actionsSize?: FormInputSize;
}) => {
  const [value, setValue] = useState(defaultValue ?? items[0]?.id ?? "");
  return (
    <Tabs value={value} onChange={setValue}>
      <Tabs.TabList
        {...listProps}
        items={items}
        actions={withActions ? exampleActions(actionsSize) : undefined}
      />
    </Tabs>
  );
};

/**
 * The args wired to Storybook's controls panel. Stories spread these first, so a
 * control applies everywhere a story (or a labelled example) doesn't pin the
 * prop itself — pinned props deliberately ignore the control.
 */
type ControlArgs = Pick<TabListProps, "variant" | "align" | "size">;

const meta = {
  title: "Components/Tabs",
  component: TabList,
  args: {
    variant: "line",
    align: "left",
    size: "md",
  },
} satisfies Meta<TabListProps>;

export default meta;

type Story = StoryObj<ControlArgs>;

type Example = {
  label: string;
  items: TabItem[];
  withActions?: boolean;
  listProps?: Partial<Omit<TabListProps, "items" | "selected" | "actions">>;
};

const wideListClass = css({ width: "[560px]", maxWidth: "full" });

// Taller than the lists' fit-content height, so the vertical `align` prop has
// room to distribute the tabs
const tallListClass = css({ height: "[280px]" });

const examples: Example[] = [
  { label: "default", items: textItems },
  { label: "many tabs", items: manyItems, withActions: true },
  { label: "kitchen sink", items: kitchenSinkItems, withActions: true },
  { label: "item alignment", items: alignmentItems },
  { label: "help tooltips", items: helpTooltipItems },
  {
    label: "kitchen sink, center",
    items: kitchenSinkItems,
    withActions: true,
    listProps: { align: "center", className: wideListClass },
  },
  {
    label: "kitchen sink, fullWidth",
    items: kitchenSinkItems,
    withActions: true,
    listProps: { align: "fullWidth", className: wideListClass },
  },
  {
    label: "vertical kitchen sink",
    items: kitchenSinkItems,
    withActions: true,
    listProps: { orientation: "vertical" },
  },
  {
    label: "vertical item alignment",
    items: verticalAlignmentItems,
    listProps: { orientation: "vertical" },
  },
  {
    label: "vertical kitchen sink, center",
    items: kitchenSinkItems,
    withActions: true,
    listProps: {
      orientation: "vertical",
      align: "center",
      className: tallListClass,
    },
  },
  {
    label: "vertical kitchen sink, fullWidth",
    items: kitchenSinkItems,
    withActions: true,
    listProps: {
      orientation: "vertical",
      align: "fullWidth",
      className: tallListClass,
    },
  },
  {
    label: "scrolling",
    items: manyItems,
    withActions: true,
    listProps: { className: css({ width: "[360px]", maxWidth: "full" }) },
  },
  {
    label: "vertical scrolling",
    items: manyItems,
    withActions: true,
    listProps: {
      orientation: "vertical",
      className: css({ height: "[160px]" }),
    },
  },
];

const headingClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s90",
});

const labelClass = css({
  fontSize: "[12px]",
  color: "neutral.s80",
});

const variants = ["line", "pill", "folder"] as const;

export const Default: Story = {
  render: (args: ControlArgs) => (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "[150px repeat(3, minmax(0, max-content))]",
        maxWidth: "full",
        alignItems: "start",
        columnGap: "[32px]",
        rowGap: "[24px]",
      })}
    >
      <span />
      {variants.map((variant) => (
        <span key={variant} className={headingClass}>
          {variant}
        </span>
      ))}
      {examples.map(({ label, items, withActions, listProps }) => (
        <Fragment key={label}>
          <span className={labelClass}>{label}</span>
          {variants.map((variant) => (
            <ControlledTabs
              key={variant}
              {...args}
              {...listProps}
              items={items}
              withActions={withActions}
              variant={variant}
            />
          ))}
        </Fragment>
      ))}
    </div>
  ),
};

// variant/orientation/size go through the Tabs root, which forwards them to
// both the list and the panels
const ContentTabs = ({
  items,
  withActions,
  actionsSize,
  variant,
  orientation,
  size,
  ...listProps
}: Omit<TabListProps, "selected" | "actions"> & {
  withActions?: boolean;
  actionsSize?: FormInputSize;
}) => {
  const [value, setValue] = useState(items[0]?.id ?? "");
  return (
    <Tabs
      value={value}
      onChange={setValue}
      variant={variant}
      orientation={orientation}
      size={size}
    >
      <Tabs.TabList
        {...listProps}
        items={items}
        actions={withActions ? exampleActions(actionsSize) : undefined}
      />
      <Tabs.TabContent
        className={css({ fontSize: "[14px]" })}
        items={items.map((item) => ({
          id: item.id,
          children: `Panel content for “${item.id}”.`,
        }))}
      />
    </Tabs>
  );
};

export const Sizes: Story = {
  render: (args: ControlArgs) => (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "[90px repeat(3, minmax(0, max-content))]",
        maxWidth: "full",
        alignItems: "start",
        columnGap: "[32px]",
        rowGap: "[20px]",
      })}
    >
      <span />
      {variants.map((variant) => (
        <span key={variant} className={headingClass}>
          {variant}
        </span>
      ))}
      {(["horizontal", "vertical"] as const).map((orientation) =>
        tabSizes.map((size) => {
          // Actions two sizes below the tabs on the full button ladder; none
          // where it runs out
          const ladderIndex = formInputSizes.indexOf(size);
          const actionsSize =
            ladderIndex > 1 ? formInputSizes[ladderIndex - 2] : undefined;
          return (
            <Fragment key={`${orientation}-${size}`}>
              <span className={labelClass}>
                {orientation === "vertical" ? `${size} vertical` : size}
              </span>
              {variants.map((variant) => (
                <ContentTabs
                  key={variant}
                  {...args}
                  items={kitchenSinkItems}
                  withActions={actionsSize !== undefined}
                  actionsSize={actionsSize}
                  variant={variant}
                  size={size}
                  orientation={orientation}
                />
              ))}
            </Fragment>
          );
        }),
      )}
    </div>
  ),
};

const contentExamples: Example[] = [
  { label: "kitchen sink", items: kitchenSinkItems, withActions: true },
  { label: "many tabs", items: manyItems, withActions: true },
  {
    label: "vertical kitchen sink",
    items: kitchenSinkItems,
    withActions: true,
    listProps: { orientation: "vertical" },
  },
  {
    label: "vertical many tabs",
    items: manyItems,
    withActions: true,
    listProps: { orientation: "vertical" },
  },
];

export const WithContent: Story = {
  render: (args: ControlArgs) => (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: "[150px repeat(3, minmax(0, max-content))]",
        maxWidth: "full",
        alignItems: "start",
        columnGap: "[32px]",
        rowGap: "[32px]",
      })}
    >
      <span />
      {variants.map((variant) => (
        <span key={variant} className={headingClass}>
          {variant}
        </span>
      ))}
      {contentExamples.map(({ label, items, withActions, listProps }) => (
        <Fragment key={label}>
          <span className={labelClass}>{label}</span>
          {variants.map((variant) => (
            <ContentTabs
              key={variant}
              {...args}
              {...listProps}
              items={items}
              withActions={withActions}
              variant={variant}
            />
          ))}
        </Fragment>
      ))}
    </div>
  ),
};
