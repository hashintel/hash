import { Fragment, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Avatar, type AvatarProps } from "./avatar";

import type { Story, StoryDefault } from "@ladle/react";

const sampleImage = "https://avatars.githubusercontent.com/u/1846056?v=4";

const noop = () => {
  /* story click handler */
};

export default {
  title: "Components/Avatar",
  parameters: {
    layout: "centered",
    controls: { disabled: true },
  },
} satisfies StoryDefault<AvatarProps>;

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
  variant: AvatarProps["variant"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="image"
    variant={variant}
    tone={tone}
    alt="Christian Busch"
    src={sampleImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="initial-1"
    variant={variant}
    tone={tone}
    alt="Christian"
    placeholder={{ initials: "C" }}
    onClick={noop}
  />,
  <Avatar
    key="initials-2"
    variant={variant}
    tone={tone}
    alt="Christian Busch"
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="icon"
    variant={variant}
    tone={tone}
    alt="Settings"
    placeholder={{ icon: "gear" }}
    onClick={noop}
  />,
  <Avatar
    key="custom"
    variant={variant}
    tone={tone}
    alt="Fox"
    placeholder={{ custom: "🦊" }}
    onClick={noop}
  />,
  <Avatar
    key="static"
    variant={variant}
    tone={tone}
    alt="Christian Busch"
    placeholder={{ initials: "CB" }}
  />,
];

export const Default: Story<AvatarProps> = () => (
  <LabeledGrid
    columnLabels={placeholderColumns}
    rows={[
      { label: "Circle · neutral", cells: defaultCells("circle", "neutral") },
      { label: "Square · neutral", cells: defaultCells("square", "neutral") },
      { label: "Circle · brand", cells: defaultCells("circle", "brand") },
    ]}
  />
);

const sizeCells = (variant: AvatarProps["variant"]): ReactNode[] =>
  formInputSizes.map((size) => (
    <Avatar
      key={size}
      variant={variant}
      size={size}
      alt="Christian Busch"
      placeholder={{ initials: "CB" }}
    />
  ));

export const Sizes: Story<AvatarProps> = () => (
  <LabeledGrid
    columnLabels={[...formInputSizes]}
    rows={[
      { label: "Circle", cells: sizeCells("circle") },
      { label: "Square", cells: sizeCells("square") },
    ]}
  />
);

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

const imageColumns = ["Error", "Loading", "Transparent bg", "White bg"];

const imageCells = (
  variant: AvatarProps["variant"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="error"
    variant={variant}
    tone={tone}
    size="lg"
    alt="Failed to load"
    src={brokenImage}
    placeholder={{ initials: "CB" }}
  />,
  <Avatar
    key="loading"
    variant={variant}
    tone={tone}
    size="lg"
    alt="Loading"
    src={loadingImage}
    placeholder={{ initials: "CB" }}
  />,
  <Avatar
    key="transparent"
    variant={variant}
    tone={tone}
    size="lg"
    alt="Transparent image"
    src={transparentImage}
    placeholder={{ initials: "CB" }}
  />,
  <Avatar
    key="white"
    variant={variant}
    tone={tone}
    size="lg"
    alt="White background image"
    src={whiteImage}
    placeholder={{ initials: "CB" }}
  />,
];

export const Images: Story<AvatarProps> = () => (
  <LabeledGrid
    columnLabels={imageColumns}
    rows={[
      { label: "Circle · neutral", cells: imageCells("circle", "neutral") },
      { label: "Square · neutral", cells: imageCells("square", "neutral") },
      { label: "Circle · brand", cells: imageCells("circle", "brand") },
    ]}
  />
);
