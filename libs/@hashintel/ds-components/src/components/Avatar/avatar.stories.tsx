import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Avatar, type AvatarProps } from "./avatar";

import type { Story, StoryDefault } from "@ladle/react";

const sampleImage = "https://avatars.githubusercontent.com/u/1846056?v=4";

const variants = ["circle", "square"] as const;

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

const column = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
});

const row = css({
  display: "flex",
  gap: "[16px]",
  alignItems: "center",
});

const defaultRow = (
  variant: AvatarProps["variant"],
  tone: AvatarProps["tone"],
) => (
  <div key={`${tone}-${variant}`} className={row}>
    <Avatar
      variant={variant}
      tone={tone}
      alt="Christian Busch"
      src={sampleImage}
      placeholder={{ initials: "CB" }}
      onClick={noop}
    />
    <Avatar
      variant={variant}
      tone={tone}
      alt="Christian"
      placeholder={{ initials: "C" }}
      onClick={noop}
    />
    <Avatar
      variant={variant}
      tone={tone}
      alt="Christian Busch"
      placeholder={{ initials: "CB" }}
      onClick={noop}
    />
    <Avatar
      variant={variant}
      tone={tone}
      alt="Settings"
      placeholder={{ icon: "gear" }}
      onClick={noop}
    />
    <Avatar
      variant={variant}
      tone={tone}
      alt="Fox"
      placeholder={{ custom: "🦊" }}
      onClick={noop}
    />
    <Avatar
      variant={variant}
      tone={tone}
      alt="Christian Busch"
      placeholder={{ initials: "CB" }}
    />
  </div>
);

export const Default: Story<AvatarProps> = () => (
  <div className={column}>
    {variants.map((variant) => defaultRow(variant, "neutral"))}
    {defaultRow("circle", "brand")}
  </div>
);

export const Sizes: Story<AvatarProps> = () => (
  <div className={column}>
    {variants.map((variant) => (
      <div key={variant} className={row}>
        {formInputSizes.map((size) => (
          <Avatar
            key={size}
            variant={variant}
            size={size}
            alt="Christian Busch"
            placeholder={{ initials: "CB" }}
          />
        ))}
      </div>
    ))}
  </div>
);
