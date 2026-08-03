import { css } from "@hashintel/ds-helpers/css";

import { Avatar } from "../Avatar/avatar";
import { Button } from "../Button/button";
import { Icon } from "../Icon/icon";
import { Badge, type BadgeProps } from "./badge";

import type { ChipColor } from "../Chip/chip";
import type { Story, StoryDefault } from "@ladle/react";

const colors: ChipColor[] = [
  "grey",
  "red",
  "blue",
  "green",
  "orange",
  "yellow",
  "purple",
  "pink",
];

const shapes: NonNullable<BadgeProps["shape"]>[] = ["square", "round"];

const positions: NonNullable<BadgeProps["position"]>[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const noop = () => undefined;

const row = css({
  display: "flex",
  gap: "[20px]",
  alignItems: "center",
  flexWrap: "wrap",
});

// Wider gaps for the position / anchor rows: a long badge overhangs its corner
// by ~half its width, so neighbours need room to not collide.
const wideRow = css({
  display: "flex",
  gap: "[72px]",
  alignItems: "center",
  flexWrap: "wrap",
});

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[20px]",
});

const rowLabel = css({
  width: "[90px]",
  flexShrink: "0",
  textStyle: "sm",
  color: "fg.muted",
});

const sectionTitle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
  marginTop: "[8px]",
});

const bell = css({ color: "fg.muted" });

/** The bell icon the badge attaches to in most of these examples. */
const Bell = () => <Icon name="bell" size="lg" className={bell} />;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className={sectionTitle}>{children}</div>
);

// An anchor plus its caption, so the "attaches to anything" rows read clearly.
const anchorCell = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "[10px]",
});

const caption = css({ textStyle: "xs", color: "fg.subtle" });

const smallText = css({ textStyle: "xs", color: "fg.body" });

const largeText = css({
  textStyle: "2xl",
  fontWeight: "semibold",
  color: "fg.heading",
});

// A stand-in app tile / thumbnail — the kind of square that carries a count.
const tile = css({
  width: "[40px]",
  height: "[40px]",
  borderRadius: "lg",
  background: "bg.subtle",
  border: "1px solid",
  borderColor: "bd.subtle",
});

const AnchorCell = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className={anchorCell}>
    {children}
    <span className={caption}>{label}</span>
  </div>
);

// The range of elements a badge attaches to, all carrying the same `content`.
const Anchors = ({
  content,
  color,
  position,
}: Pick<BadgeProps, "content" | "color" | "position">) => (
  <div className={wideRow}>
    <AnchorCell label="icon">
      <Badge content={content} color={color} position={position}>
        <Bell />
      </Badge>
    </AnchorCell>
    <AnchorCell label="button">
      <Badge content={content} color={color} position={position}>
        <Button variant="subtle" onClick={noop}>
          Inbox
        </Button>
      </Badge>
    </AnchorCell>
    <AnchorCell label="avatar">
      <Badge content={content} color={color} position={position}>
        <Avatar fallback="AL" size="40" />
      </Badge>
    </AnchorCell>
    <AnchorCell label="small text">
      <Badge content={content} color={color} position={position}>
        <span className={smallText}>Messages</span>
      </Badge>
    </AnchorCell>
    <AnchorCell label="large text">
      <Badge content={content} color={color} position={position}>
        <span className={largeText}>Updates</span>
      </Badge>
    </AnchorCell>
    <AnchorCell label="tile">
      <Badge content={content} color={color} position={position}>
        <span className={tile} />
      </Badge>
    </AnchorCell>
  </div>
);

export default {
  title: "Components/Badge",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    color: { control: { type: "select", options: colors } },
    shape: { control: { type: "select", options: shapes } },
    position: { control: { type: "select", options: positions } },
    content: { control: { type: "text" } },
  },
  args: {
    content: "9",
    color: "red",
    shape: "round",
    position: "top-right",
  },
} satisfies StoryDefault<BadgeProps>;

// A single showcase covering colours, shape, and content.
export const Default: Story<BadgeProps> = () => (
  <div className={column}>
    <SectionTitle>Colours</SectionTitle>
    <div className={row}>
      {colors.map((color) => (
        <Badge key={color} content={9} color={color}>
          <Bell />
        </Badge>
      ))}
    </div>

    <SectionTitle>Shape</SectionTitle>
    <div className={row}>
      {shapes.map((shape) => (
        <Badge key={shape} content={9} shape={shape} color="red">
          <Bell />
        </Badge>
      ))}
    </div>

    {/* `max` defaults to 99, so 100/1000 render as "99+". Content can be a
        string, an icon, or an icon + text; omitting it renders a plain dot. */}
    <SectionTitle>Content</SectionTitle>
    <div className={row}>
      {[9, 99, 100, 1000].map((count) => (
        <Badge key={count} content={count} color="red">
          <Bell />
        </Badge>
      ))}
      <Badge content="new" color="red">
        <Bell />
      </Badge>
      <Badge content={<Icon name="check" size="xxs" />} color="green">
        <Bell />
      </Badge>
      <Badge
        content={
          <>
            <Icon name="sparkles" size="xxs" />
            New
          </>
        }
        color="purple"
      >
        <Bell />
      </Badge>
      <Badge color="green">
        <Bell />
      </Badge>
    </div>
  </div>
);
Default.parameters = {
  controls: { exclude: ["color", "shape", "position", "content"] },
};

// Short content at each corner, then the badge across a range of anchor
// elements — with short content, and with long content at two corners to show
// the width clamp extending outward from the anchor's midline.
export const Position: Story<BadgeProps> = (args) => (
  <div className={column}>
    <div className={wideRow}>
      <div className={rowLabel}>short</div>
      {positions.map((position) => (
        <Badge
          key={position}
          content={9}
          position={position}
          color={args.color}
          shape={args.shape}
        >
          <Bell />
        </Badge>
      ))}
    </div>

    <SectionTitle>Attaches to any content</SectionTitle>
    <Anchors content={9} color={args.color} />
    <Anchors content={null} color={args.color} />

    <SectionTitle>…and grows with longer content</SectionTitle>
    <Anchors content="Processing" color={args.color} />
    <Anchors content="Processing" position="bottom-left" color={args.color} />
  </div>
);
Position.parameters = { controls: { exclude: ["position", "content"] } };
