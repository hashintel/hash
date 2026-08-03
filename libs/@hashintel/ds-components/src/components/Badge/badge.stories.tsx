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

const variants: NonNullable<BadgeProps["variant"]>[] = ["fill", "outline"];

const shapes: NonNullable<BadgeProps["shape"]>[] = ["default", "round"];

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
  variant,
}: Pick<BadgeProps, "content" | "color" | "variant">) => (
  <div className={wideRow}>
    <AnchorCell label="icon">
      <Badge content={content} color={color} variant={variant}>
        <Bell />
      </Badge>
    </AnchorCell>
    <AnchorCell label="button">
      <Badge content={content} color={color} variant={variant}>
        <Button variant="subtle" onClick={noop}>
          Inbox
        </Button>
      </Badge>
    </AnchorCell>
    <AnchorCell label="avatar">
      <Badge content={content} color={color} variant={variant}>
        <Avatar fallback="AL" size="40" />
      </Badge>
    </AnchorCell>
    <AnchorCell label="small text">
      <Badge content={content} color={color} variant={variant}>
        <span className={smallText}>Messages</span>
      </Badge>
    </AnchorCell>
    <AnchorCell label="large text">
      <Badge content={content} color={color} variant={variant}>
        <span className={largeText}>Updates</span>
      </Badge>
    </AnchorCell>
    <AnchorCell label="tile">
      <Badge content={content} color={color} variant={variant}>
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
    variant: { control: { type: "select", options: variants } },
    shape: { control: { type: "select", options: shapes } },
    position: { control: { type: "select", options: positions } },
    content: { control: { type: "text" } },
  },
  args: {
    content: "9",
    color: "red",
    variant: "fill",
    shape: "round",
    position: "top-right",
  },
} satisfies StoryDefault<BadgeProps>;

// A single showcase covering colours/variants, shape, content, and clickable.
export const Default: Story<BadgeProps> = () => (
  <div className={column}>
    <SectionTitle>Colours &amp; variants</SectionTitle>
    {variants.map((variant) => (
      <div className={row} key={variant}>
        <div className={rowLabel}>{variant}</div>
        {colors.map((color) => (
          <Badge key={color} content={9} color={color} variant={variant}>
            <Bell />
          </Badge>
        ))}
      </div>
    ))}

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

    {/* A clickable badge renders as a button with hover and focus-ring states. */}
    <SectionTitle>Clickable</SectionTitle>
    <div className={row}>
      <Badge content={9} onClick={noop} color="red">
        <Bell />
      </Badge>
      <Badge onClick={noop} color="red">
        <Bell />
      </Badge>
    </div>
  </div>
);
Default.parameters = {
  controls: { exclude: ["color", "variant", "shape", "position", "content"] },
};

// Each corner, at three content lengths, then the same across a range of anchor
// elements — once with short content, once with long (~10 char) content.
const positionRows: { label: string; content: BadgeProps["content"] }[] = [
  { label: "short", content: 9 },
  { label: "medium", content: "Beta" },
  { label: "long", content: "Processing" },
];

export const Position: Story<BadgeProps> = (args) => (
  <div className={column}>
    {positionRows.map(({ label, content }) => (
      <div className={wideRow} key={label}>
        <div className={rowLabel}>{label}</div>
        {positions.map((position) => (
          <Badge
            key={position}
            content={content}
            position={position}
            color={args.color}
            variant={args.variant}
            shape={args.shape}
          >
            <Bell />
          </Badge>
        ))}
      </div>
    ))}

    <SectionTitle>Attaches to any content</SectionTitle>
    <Anchors content={9} color={args.color} variant={args.variant} />

    <SectionTitle>…and grows with longer content</SectionTitle>
    <Anchors content="Processing" color={args.color} variant={args.variant} />
  </div>
);
Position.parameters = { controls: { exclude: ["position", "content"] } };
