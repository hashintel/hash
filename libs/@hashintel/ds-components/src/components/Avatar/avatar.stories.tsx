import { Fragment, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Avatar } from "./avatar";

import type { Story, StoryDefault } from "@ladle/react";

const sampleImage = "https://avatars.githubusercontent.com/u/1846056?v=4";

const noop = () => {};

type AvatarProps = React.ComponentProps<typeof Avatar>;

export default {
  title: "Components/Avatar",
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
  shape: AvatarProps["shape"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="image"
    shape={shape}
    tone={tone}
    alt="Christian Busch"
    src={sampleImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="initial-1"
    shape={shape}
    tone={tone}
    alt="Christian"
    placeholder={{ initials: "C" }}
    onClick={noop}
  />,
  <Avatar
    key="initials-2"
    shape={shape}
    tone={tone}
    alt="Christian Busch"
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="icon"
    shape={shape}
    tone={tone}
    alt="Christian Busch"
    placeholder={{ icon: "user" }}
    onClick={noop}
  />,
  <Avatar
    key="custom"
    shape={shape}
    tone={tone}
    alt="Fox"
    placeholder={{ custom: "🦊" }}
    onClick={noop}
  />,
  <Avatar
    key="static"
    shape={shape}
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

// With size="custom" the consumer sets --avatar-size and the component derives
// the box (aspect-ratio squares it), typography, and border radius — here 100×100.
const customSizeClass = css({
  "--avatar-size": "100px",
});

const sizeCells = (
  shape: AvatarProps["shape"],
  placeholder: AvatarProps["placeholder"],
  alt = "Christian Busch",
): ReactNode[] => [
  ...formInputSizes.map((size) => (
    <Avatar
      key={size}
      shape={shape}
      size={size}
      alt={alt}
      placeholder={placeholder}
    />
  )),
  <Avatar
    key="custom"
    shape={shape}
    size="custom"
    className={customSizeClass}
    alt={alt}
    placeholder={placeholder}
  />,
];

export const Sizes: Story<AvatarProps> = () => (
  <LabeledGrid
    columnLabels={[...formInputSizes, "Custom"]}
    rows={[
      { label: "Circle", cells: sizeCells("circle", { initials: "CB" }) },
      { label: "Square", cells: sizeCells("square", { initials: "CB" }) },
      {
        label: "Circle · icon",
        cells: sizeCells("circle", { icon: "user" }, "Christian Busch"),
      },
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
  shape: AvatarProps["shape"],
  tone: AvatarProps["tone"],
): ReactNode[] => [
  <Avatar
    key="error"
    shape={shape}
    tone={tone}
    size="lg"
    alt="Failed to load"
    src={brokenImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="loading"
    shape={shape}
    tone={tone}
    size="lg"
    alt="Loading"
    src={loadingImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="transparent"
    shape={shape}
    tone={tone}
    size="lg"
    alt="Transparent image"
    src={transparentImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="white"
    shape={shape}
    tone={tone}
    size="lg"
    alt="White background image"
    src={whiteImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
  />,
  <Avatar
    key="dark-green"
    shape={shape}
    tone={tone}
    size="lg"
    alt="Dark green background image"
    src={darkGreenImage}
    placeholder={{ initials: "CB" }}
    onClick={noop}
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
