import { Fragment, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Avatar } from "./avatar";

import type { Meta, StoryObj } from "@storybook/react-vite";

const sampleImage = "https://avatars.githubusercontent.com/u/2991143?v=4";

const noop = () => {};

type AvatarProps = React.ComponentProps<typeof Avatar>;

// Control args without the onClick/href exclusive union, so cells can spread
// them and still pin their own onClick.
type AvatarArgs = Partial<Omit<AvatarProps, "onClick" | "href" | "target">>;

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  args: {
    size: "md",
    tone: "neutral",
  },
} satisfies Meta<AvatarProps>;

export default meta;

type Story = StoryObj<AvatarProps>;

const grid = css({
  display: "inline-grid",
  gap: "[16px]",
  alignItems: "center",
  justifyItems: "center",
});

const columnLabelClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s70",
  textAlign: "center",
});

const rowLabelClass = css({
  justifySelf: "end",
  fontSize: "[12px]",
  color: "neutral.s70",
  whiteSpace: "nowrap",
});

type GridRow = { label: string; cells: ReactNode[] };

/** A grid of avatars with a header row of column labels and a leading label per row */
const LabeledGrid = ({
  columnLabels,
  rows,
}: {
  columnLabels: string[];
  rows: GridRow[];
}) => (
  <div
    className={grid}
    style={{ gridTemplateColumns: `auto repeat(${columnLabels.length}, auto)` }}
  >
    <span />
    {columnLabels.map((label) => (
      <span key={label} className={columnLabelClass}>
        {label}
      </span>
    ))}
    {rows.map((gridRow) => (
      <Fragment key={gridRow.label}>
        <span className={rowLabelClass}>{gridRow.label}</span>
        {gridRow.cells}
      </Fragment>
    ))}
  </div>
);

const placeholderColumns = [
  "Image",
  "1 initial",
  "2 initials",
  "Icon",
  "Custom",
  "Static",
];

const defaultCells = (
  args: AvatarArgs,
  shape: AvatarProps["shape"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="image"
    {...args}
    shape={shape}
    tone={tone}
    alt="Chris Feijoo"
    src={sampleImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="initial-1"
    {...args}
    shape={shape}
    tone={tone}
    alt="Chris"
    placeholder={{ initials: "C" }}
    onClick={noop}
  />,
  <Avatar
    key="initials-2"
    {...args}
    shape={shape}
    tone={tone}
    alt="Chris Feijoo"
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="icon"
    {...args}
    shape={shape}
    tone={tone}
    alt="Chris Feijoo"
    placeholder={{ icon: "user" }}
    onClick={noop}
  />,
  <Avatar
    key="custom"
    {...args}
    shape={shape}
    tone={tone}
    alt="Fox"
    placeholder={{ custom: "🦊" }}
    onClick={noop}
  />,
  <Avatar
    key="static"
    {...args}
    shape={shape}
    tone={tone}
    alt="Chris Feijoo"
    placeholder={{ initials: "CF" }}
  />,
];

export const Default: Story = {
  render: (args: AvatarArgs) => (
    <LabeledGrid
      columnLabels={placeholderColumns}
      rows={[
        {
          label: "Circle · neutral",
          cells: defaultCells(args, "circle", "neutral"),
        },
        {
          label: "Square · neutral",
          cells: defaultCells(args, "square", "neutral"),
        },
        {
          label: "Circle · brand",
          cells: defaultCells(args, "circle", "brand"),
        },
      ]}
    />
  ),
};

// With size="custom" the consumer sets --avatar-size and the component derives
// the box (aspect-ratio squares it), typography, and border radius — here 100×100.
const customSizeClass = css({
  "--avatar-size": "100px",
});

const sizeCells = (
  args: AvatarArgs,
  shape: AvatarProps["shape"],
  placeholder: AvatarProps["placeholder"],
  alt = "Chris Feijoo",
): ReactNode[] => [
  ...formInputSizes.map((size) => (
    <Avatar
      key={size}
      {...args}
      shape={shape}
      size={size}
      alt={alt}
      placeholder={placeholder}
    />
  )),
  <Avatar
    key="custom"
    {...args}
    shape={shape}
    size="custom"
    className={customSizeClass}
    alt={alt}
    placeholder={placeholder}
  />,
];

export const Sizes: Story = {
  render: (args: AvatarArgs) => (
    <LabeledGrid
      columnLabels={[...formInputSizes, "Custom"]}
      rows={[
        {
          label: "Circle",
          cells: sizeCells(args, "circle", { initials: "CF" }),
        },
        {
          label: "Square",
          cells: sizeCells(args, "square", { initials: "CF" }),
        },
        {
          label: "Circle · icon",
          cells: sizeCells(args, "circle", { icon: "user" }, "Chris Feijoo"),
        },
      ]}
    />
  ),
};

const svgAvatar = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">${body}</svg>`,
  )}`;

// Undecodable payload — the browser fires `error`, falling back to the placeholder
const brokenImage = "data:image/png;base64,thisisnotavalidpngpayload";
// TEST-NET-1 (RFC 5737) never routes, so the request stays pending — shows the loading state
const loadingImage = "https://192.0.2.1/avatar.png";
// Colored shape on a transparent canvas — the avatar fill shows through around it
const transparentImage = svgAvatar(
  `<circle cx="40" cy="40" r="22" fill="#e5484d"/>`,
);
// Same shape on an opaque white canvas — white meets the avatar border
const whiteImage = svgAvatar(
  `<rect width="80" height="80" fill="#ffffff"/><circle cx="40" cy="40" r="22" fill="#3b82f6"/>`,
);
// Shape on a dark green canvas — a dark image against the light border/page
const darkGreenImage = svgAvatar(
  `<rect width="80" height="80" fill="#0a5c2c"/><circle cx="40" cy="40" r="22" fill="#f59e0b"/>`,
);

const imageColumns = [
  "Error",
  "Loading",
  "Transparent img",
  "White img",
  "Dark green img",
];

const imageCells = (
  args: AvatarArgs,
  shape: AvatarProps["shape"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="error"
    {...args}
    shape={shape}
    tone={tone}
    size="lg"
    alt="Failed to load"
    src={brokenImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="loading"
    {...args}
    shape={shape}
    tone={tone}
    size="lg"
    alt="Loading"
    src={loadingImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="transparent"
    {...args}
    shape={shape}
    tone={tone}
    size="lg"
    alt="Transparent image"
    src={transparentImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="white"
    {...args}
    shape={shape}
    tone={tone}
    size="lg"
    alt="White background image"
    src={whiteImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
  <Avatar
    key="dark-green"
    {...args}
    shape={shape}
    tone={tone}
    size="lg"
    alt="Dark green background image"
    src={darkGreenImage}
    placeholder={{ initials: "CF" }}
    onClick={noop}
  />,
];

export const Images: Story = {
  render: (args: AvatarArgs) => (
    <LabeledGrid
      columnLabels={imageColumns}
      rows={[
        {
          label: "Circle · neutral",
          cells: imageCells(args, "circle", "neutral"),
        },
        {
          label: "Square · neutral",
          cells: imageCells(args, "square", "neutral"),
        },
        {
          label: "Circle · brand",
          cells: imageCells(args, "circle", "brand"),
        },
      ]}
    />
  ),
};
