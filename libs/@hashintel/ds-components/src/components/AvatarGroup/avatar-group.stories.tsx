import { Fragment, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Avatar } from "../Avatar/avatar";
import { Tooltip } from "../Tooltip/tooltip";
import { AvatarGroup } from "./avatar-group";

import type { Story, StoryDefault } from "@ladle/react";

type AvatarGroupProps = React.ComponentProps<typeof AvatarGroup>;
type AvatarProps = React.ComponentProps<typeof Avatar>;

// The static fields the sample data sets. Kept free of the onClick/href
// exclusive union so a story can spread these and still add its own onClick.
type PersonAvatar = {
  shape: "circle" | "square";
  alt: string;
  src?: string;
  placeholder: AvatarProps["placeholder"];
};

const sampleImage = "https://avatars.githubusercontent.com/u/1846056?v=4";

export default {
  title: "Components/AvatarGroup",
} satisfies StoryDefault<AvatarGroupProps>;

// Avatars are passed as children; the group sets size/tone via context, so the
// children below leave those unset.
const people: PersonAvatar[] = [
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

const asShape = (shape: "circle" | "square"): PersonAvatar[] =>
  people.map((avatar) => ({ ...avatar, shape }));

const mixedShapes: PersonAvatar[] = people.map((avatar, index) => ({
  ...avatar,
  shape: index % 2 === 0 ? "circle" : "square",
}));

const avatarsOf = (list: PersonAvatar[]) =>
  list.map((props) => <Avatar key={props.src ?? props.alt} {...props} />);

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
      {
        label: "All avatars",
        content: <AvatarGroup>{avatarsOf(people)}</AvatarGroup>,
      },
      {
        label: "lastOnTop",
        content: <AvatarGroup lastOnTop>{avatarsOf(people)}</AvatarGroup>,
      },
      {
        label: "max = 4",
        content: <AvatarGroup max={4}>{avatarsOf(people)}</AvatarGroup>,
      },
      {
        label: "total = 24",
        content: (
          <AvatarGroup max={4} total={24}>
            {avatarsOf(people)}
          </AvatarGroup>
        ),
      },
      {
        label: "custom overflow",
        content: (
          <AvatarGroup>
            {avatarsOf(people.slice(0, 3))}
            <AvatarGroup.More alt="99 or more people">
              <span style={{ fontSize: 11 }}>99+</span>
            </AvatarGroup.More>
          </AvatarGroup>
        ),
      },
      {
        label: "brand tone",
        content: (
          <AvatarGroup max={4} tone="brand">
            {avatarsOf(people)}
          </AvatarGroup>
        ),
      },
      {
        label: "square",
        content: (
          <AvatarGroup max={4}>{avatarsOf(asShape("square"))}</AvatarGroup>
        ),
      },
      {
        label: "mixed shapes",
        content: <AvatarGroup max={4}>{avatarsOf(mixedShapes)}</AvatarGroup>,
      },
      {
        label: "spacing = sm",
        content: (
          <AvatarGroup max={4} spacing="sm">
            {avatarsOf(people)}
          </AvatarGroup>
        ),
      },
      {
        label: "with tooltips",
        content: (
          <AvatarGroup max={4}>
            {people.map((props) => (
              <Tooltip
                key={props.src ?? props.alt}
                content={props.alt}
                position="bottom"
              >
                <Avatar
                  {...props}
                  onClick={() => {
                    // eslint-disable-next-line no-console
                    console.log(`Clicked ${props.alt}`);
                  }}
                />
              </Tooltip>
            ))}
          </AvatarGroup>
        ),
      },
    ]}
  />
);

export const Sizes: Story<AvatarGroupProps> = () => (
  <Rows
    rows={[
      ...formInputSizes.map((size) => ({
        label: size,
        content: (
          <AvatarGroup max={4} size={size}>
            {avatarsOf(people)}
          </AvatarGroup>
        ),
      })),
      {
        label: "custom (64px)",
        content: (
          <AvatarGroup max={4} size="custom" className={customSizeClass}>
            {avatarsOf(people)}
          </AvatarGroup>
        ),
      },
    ]}
  />
);
