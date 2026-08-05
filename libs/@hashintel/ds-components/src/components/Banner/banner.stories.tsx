import { css } from "@hashintel/ds-helpers/css";

import { Avatar } from "../Avatar/avatar";
import { Icon } from "../Icon/icon";
import { Banner } from "./banner";
import { bannerTones, bannerVariants } from "./banner.recipe";

import type { Story, StoryDefault } from "@ladle/react";

type BannerTone = (typeof bannerTones)[number];
type BannerVariant = (typeof bannerVariants)[number];

const noop = () => undefined;

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[20px]",
  width: "[720px]",
  maxWidth: "[100%]",
});

// One row of per-variant columns that wrap to the next line when the viewport
// can't fit them side by side.
const variantColumns = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: "[24px]",
});

const variantColumn = css({
  display: "flex",
  flexDirection: "column",
  gap: "[16px]",
  flex: "[1 1 360px]",
  minWidth: "0",
});

const variantHeading = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.body",
});

const label = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.muted",
  marginBottom: "1.5",
  textTransform: "capitalize",
});

/**
 * The full banner: tone icon, title, description, two actions, and a dismiss
 * button. Used both in the tone/variant matrix and as one of the content
 * examples.
 */
const KitchenSinkBanner = ({
  tone,
  variant,
}: {
  tone: BannerTone;
  variant: BannerVariant;
}) => (
  <Banner
    tone={tone}
    variant={variant}
    icon
    dismissible={{ dismissible: true, onDismiss: noop }}
  >
    <Banner.Title>Summarise what happened</Banner.Title>
    <Banner.Description>
      Describe what can be done about it here.
    </Banner.Description>
    <Banner.Actions>
      <Banner.ActionButton>Approve</Banner.ActionButton>
      <Banner.ActionButton>Dismiss</Banner.ActionButton>
    </Banner.Actions>
  </Banner>
);

const Example = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className={label}>{name}</div>
    {children}
  </div>
);

const longText =
  "This release changes how workspace permissions are inherited across nested teams. Members who previously had implicit access through a parent team will need to be re-added explicitly, and any automations that relied on the old inheritance behaviour should be reviewed before the change takes effect next week.";

export default {
  title: "Components/Banner",
} satisfies StoryDefault;

/**
 * Every tone × variant, grouped into one column per variant. The columns
 * flex-wrap onto the next line when the viewport is too narrow to fit them.
 */
export const Default: Story = () => (
  <div className={variantColumns}>
    {Array.from(bannerVariants)
      .reverse()
      .map((variant) => (
        <div key={variant} className={variantColumn}>
          <div className={variantHeading}>{variant}</div>
          {bannerTones.map((tone) => (
            <Example key={tone} name={tone}>
              <KitchenSinkBanner tone={tone} variant={variant} />
            </Example>
          ))}
        </div>
      ))}
  </div>
);

/** The range of content a banner can hold — all in the brand soft variant. */
export const Content: Story = () => (
  <div className={column}>
    <Example name="Title only">
      <Banner tone="brand" variant="soft" icon={false}>
        <Banner.Title>Summarise what happened</Banner.Title>
      </Banner>
    </Example>

    <Example name="Description only">
      <Banner tone="brand" variant="soft" icon={false}>
        <Banner.Description>
          Describe what can be done about it here.
        </Banner.Description>
      </Banner>
    </Example>

    <Example name="Actions only">
      <Banner tone="brand" variant="soft" icon={false}>
        <Banner.Actions>
          <Banner.ActionButton>Accept</Banner.ActionButton>
          <Banner.ActionButton>Decline</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Title + icon + actions">
      <Banner tone="brand" variant="soft" icon>
        <Banner.Title>Summarise what happened</Banner.Title>
        <Banner.Actions>
          <Banner.ActionButton>Open</Banner.ActionButton>
          <Banner.ActionButton>Go</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Description + icon">
      <Banner tone="brand" variant="soft" icon>
        <Banner.Description>
          Describe what can be done about it here.
        </Banner.Description>
      </Banner>
    </Example>

    <Example name="Kitchen sink">
      <KitchenSinkBanner tone="brand" variant="soft" />
    </Example>

    <Example name="Custom children">
      <Banner
        tone="brand"
        variant="soft"
        icon={false}
        dismissible={{ dismissible: true, onDismiss: noop }}
      >
        <div className={css({ fontWeight: "medium", color: "neutral.s120" })}>
          <Icon
            name="sparkles"
            size="sm"
            className={css({ marginRight: "[6px]" })}
          />
          Completely custom children — you own the markup here. This block is
          deliberately long so you can see arbitrary content wrap beneath the
          floated actions rather than being pinned into a narrow column beside
          them. You can also mix and match custom content with Banner.Title,
          Banner.Description, Banner.Actions, etc.
        </div>
        <Banner.Actions>
          <Banner.ActionButton>Open</Banner.ActionButton>
          <Banner.ActionButton>Go</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Custom icon (Avatar)">
      <Banner
        tone="brand"
        variant="soft"
        icon={{
          custom: (
            <Avatar
              placeholder={{ initials: "AL" }}
              shape="circle"
              alt="Alex"
            />
          ),
        }}
      >
        <Banner.Title>Alex shared a document with you</Banner.Title>
      </Banner>
    </Example>

    <Example name="Custom icon (Avatar) + content">
      <Banner
        tone="brand"
        variant="soft"
        icon={{
          custom: (
            <Avatar
              placeholder={{ initials: "AL" }}
              shape="circle"
              alt="Alex"
            />
          ),
        }}
        dismissible={{ dismissible: true, onDismiss: noop }}
      >
        <Banner.Title>Alex shared a document with you</Banner.Title>
        <Banner.Description>
          Any node — here an Avatar — can be passed as a custom leading icon.
        </Banner.Description>
        <Banner.Actions>
          <Banner.ActionButton>Open</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Title + 4 actions">
      <Banner
        tone="brand"
        variant="soft"
        icon
        dismissible={{ dismissible: true, onDismiss: noop }}
      >
        <Banner.Title>Summarise what happened</Banner.Title>
        <Banner.Actions>
          <Banner.ActionButton>Approve</Banner.ActionButton>
          <Banner.ActionButton>Decline</Banner.ActionButton>
          <Banner.ActionButton>Snooze</Banner.ActionButton>
          <Banner.ActionButton>Details</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Extra long content">
      <Banner
        tone="brand"
        variant="soft"
        icon
        dismissible={{ dismissible: true, onDismiss: noop }}
      >
        <Banner.Title>
          Heads up about an upcoming permissions change
        </Banner.Title>
        <Banner.Description>{longText}</Banner.Description>
        <Banner.Actions>
          <Banner.ActionButton>Approve</Banner.ActionButton>
          <Banner.ActionButton>Decline</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>

    <Example name="Max width 400px">
      <Banner
        tone="brand"
        variant="soft"
        icon
        dismissible={{ dismissible: true, onDismiss: noop }}
        className={css({ maxWidth: "[400px]" })}
      >
        <Banner.Title>Summarise what happened</Banner.Title>
        <Banner.Description>
          Describe what can be done about it here.
        </Banner.Description>
        <Banner.Actions>
          <Banner.ActionButton>Open</Banner.ActionButton>
        </Banner.Actions>
      </Banner>
    </Example>
  </div>
);
