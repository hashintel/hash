import { Fragment, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { AvatarGroup } from "./avatar-group";

import type { Story, StoryDefault } from "@ladle/react";

type AvatarGroupProps = React.ComponentProps<typeof AvatarGroup>;
type Avatars = AvatarGroupProps["avatars"];

const sampleImage = "https://avatars.githubusercontent.com/u/1846056?v=4";

export default {
  title: "Components/AvatarGroup",
  parameters: {
    layout: "centered",
    controls: { disabled: true },
  },
} satisfies StoryDefault<AvatarGroupProps>;

const people: Avatars = [
  {
    shape: "circle",
    alt: "Christian Busch",
    src: sampleImage,
    placeholder: { initials: "CB" },
  },
  { shape: "circle", alt: "Ada Lovelace", placeholder: { initials: "AL" } },
  { shape: "circle", alt: "Grace Hopper", placeholder: { initials: "GH" } },
  { shape: "circle", alt: "Alan Turing", placeholder: { initials: "AT" } },
  {
    shape: "circle",
    alt: "Katherine Johnson",
    placeholder: { initials: "KJ" },
  },
  { shape: "circle", alt: "Edsger Dijkstra", placeholder: { initials: "ED" } },
  { shape: "circle", alt: "Barbara Liskov", placeholder: { initials: "BL" } },
];

const asShape = (shape: "circle" | "square"): Avatars =>
  people.map((avatar) => ({ ...avatar, shape }));

const mixedShapes: Avatars = people.map((avatar, index) => ({
  ...avatar,
  shape: index % 2 === 0 ? "circle" : "square",
}));

// custom size drives the avatar box off the --avatar-size the consumer sets
const customSizeClass = css({ "--avatar-size": "64px" });

const rowClass = css({
  display: "grid",
  gridTemplateColumns: "auto auto",
  rowGap: "[32px]",
  columnGap: "[48px]",
  alignItems: "center",
});

const labelClass = css({
  justifySelf: "end",
  fontSize: "[12px]",
  color: "neutral.s70",
  whiteSpace: "nowrap",
});

type LabeledRow = { label: string; content: ReactNode };

const Rows = ({ rows }: { rows: LabeledRow[] }) => (
  <div className={rowClass}>
    {rows.map((row) => (
      <Fragment key={row.label}>
        <span className={labelClass}>{row.label}</span>
        {row.content}
      </Fragment>
    ))}
  </div>
);

export const Default: Story<AvatarGroupProps> = () => (
  <Rows
    rows={[
      { label: "All avatars", content: <AvatarGroup avatars={people} /> },
      {
        label: "max = 4",
        content: <AvatarGroup avatars={people} max={4} />,
      },
      {
        label: "max = 4 · total = 24",
        content: <AvatarGroup avatars={people} max={4} total={24} />,
      },
      {
        label: "total = 12 (no cap)",
        content: <AvatarGroup avatars={people.slice(0, 3)} total={12} />,
      },
      {
        label: "custom overflow",
        content: (
          <AvatarGroup
            avatars={people.slice(0, 3)}
            total={<span style={{ fontSize: 11 }}>99+</span>}
          />
        ),
      },
      {
        label: "brand tone",
        content: <AvatarGroup avatars={people} max={4} tone="brand" />,
      },
      {
        label: "square",
        content: <AvatarGroup avatars={asShape("square")} max={4} />,
      },
      {
        label: "mixed shapes",
        content: <AvatarGroup avatars={mixedShapes} max={4} />,
      },
    ]}
  />
);

export const Sizes: Story<AvatarGroupProps> = () => (
  <Rows
    rows={[
      ...formInputSizes.map((size) => ({
        label: size,
        content: <AvatarGroup avatars={people} max={4} size={size} />,
      })),
      {
        label: "custom (64px)",
        content: (
          <AvatarGroup
            avatars={people}
            max={4}
            size="custom"
            className={customSizeClass}
          />
        ),
      },
    ]}
  />
);
