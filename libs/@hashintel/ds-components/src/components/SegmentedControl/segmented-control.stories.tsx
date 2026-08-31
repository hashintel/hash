import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import {
  SegmentedControl,
  type SegmentedControlProps,
} from "./segmented-control";

import type { Story, StoryDefault } from "@ladle/react";

const layouts: NonNullable<SegmentedControlProps["layout"]>[] = [
  "horizontal",
  "vertical",
];

const textItems: SegmentedControlProps["items"] = [
  { label: "List", value: "list" },
  { label: "Board", value: "board" },
  { label: "Timeline", value: "timeline" },
];

const iconItems: SegmentedControlProps["items"] = [
  { iconName: "list", value: "list", tooltip: "List view" },
  { iconName: "grid", value: "grid", tooltip: "Grid view" },
  { iconName: "chartBar", value: "chart", tooltip: "Chart view" },
];

const iconAndTextItems: SegmentedControlProps["items"] = [
  { iconName: "list", label: "List", value: "list" },
  { iconName: "grid", label: "Board", value: "board" },
  { iconName: "chartLine", label: "Timeline", value: "timeline" },
];

const ControlledSegmentedControl = ({
  defaultValue = "list",
  ...props
}: Omit<SegmentedControlProps, "value" | "onChange"> & {
  defaultValue?: string;
}) => {
  const [value, setValue] = useState(defaultValue);
  return <SegmentedControl {...props} value={value} onChange={setValue} />;
};

/**
 * The args wired to Ladle's controls panel. Stories spread these first, so a
 * control applies everywhere a story (or a labelled example) doesn't pin the
 * prop itself — pinned props deliberately ignore the control.
 */
type ControlArgs = Pick<
  SegmentedControlProps,
  "layout" | "variant" | "size" | "disabled"
>;

export default {
  title: "Components/SegmentedControl",
  argTypes: {
    layout: { options: layouts, control: { type: "select" } },
    variant: {
      options: ["default", "embossed"],
      control: { type: "select" },
    },
    size: { options: formInputSizes, control: { type: "select" } },
    disabled: { control: { type: "boolean" } },
  },
  args: {
    layout: "horizontal",
    variant: "default",
    size: "md",
    disabled: false,
  },
} satisfies StoryDefault<ControlArgs>;

type Example = {
  label: string;
  props: Omit<SegmentedControlProps, "value" | "onChange">;
  /** Initially selected value, when the items don't include the default "list" */
  defaultValue?: string;
};

const examples: Example[] = [
  { label: "text labels", props: { items: textItems } },
  { label: "icons + tooltips", props: { items: iconItems } },
  { label: "icons + text", props: { items: iconAndTextItems } },
  {
    label: "text + tooltips",
    props: {
      items: textItems.map((item) => ({
        ...item,
        tooltip: `Switch to ${item.value} view`,
      })),
    },
  },
  { label: "disabled", props: { items: textItems, disabled: true } },
  {
    label: "disabled item",
    props: {
      items: [
        { label: "List", value: "list" },
        { label: "Board", value: "board", disabled: true },
        { label: "Timeline", value: "timeline" },
      ],
    },
  },
  {
    label: "long content, short container",
    props: {
      className: css({ maxWidth: "[240px]" }),
      items: [
        { label: "Comprehensive overview", value: "overview" },
        { label: "Detailed configuration settings", value: "settings" },
        { label: "Historical activity timeline", value: "history" },
      ],
    },
    defaultValue: "overview",
  },
  {
    label: "vertical",
    props: { items: textItems, layout: "vertical" },
  },
  {
    label: "vertical icons",
    props: { items: iconItems, layout: "vertical" },
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

export const Default: Story<ControlArgs> = (args) => (
  <div
    className={css({
      display: "grid",
      gridTemplateColumns: "[160px max-content max-content]",
      alignItems: "center",
      columnGap: "[32px]",
      rowGap: "[16px]",
    })}
  >
    <span />
    <span className={headingClass}>Default</span>
    <span className={headingClass}>Embossed</span>
    {examples.map(({ label, props, defaultValue }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <ControlledSegmentedControl
          {...args}
          {...props}
          variant="default"
          defaultValue={defaultValue}
        />
        <ControlledSegmentedControl
          {...args}
          {...props}
          variant="embossed"
          defaultValue={defaultValue}
        />
      </Fragment>
    ))}
  </div>
);

export const Sizes: Story<ControlArgs> = (args) => (
  <div
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "[16px]",
    })}
  >
    {formInputSizes.map((size) => (
      <div
        key={size}
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "[24px]",
        })}
      >
        <span
          className={css({
            width: "[40px]",
            fontSize: "[12px]",
            color: "neutral.s80",
          })}
        >
          {size}
        </span>
        <ControlledSegmentedControl {...args} size={size} items={textItems} />
        <ControlledSegmentedControl {...args} size={size} items={iconItems} />
        <ControlledSegmentedControl
          {...args}
          size={size}
          items={iconAndTextItems}
        />
      </div>
    ))}
  </div>
);
