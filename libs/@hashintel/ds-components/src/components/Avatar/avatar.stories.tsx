import type { Story, StoryDefault } from "@ladle/react";

import { Avatar, type AvatarProps } from "./avatar";

// User icon SVG
const UserIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
  >
    <circle cx="12" cy="8" r="4" strokeWidth="2" />
    <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" strokeWidth="2" />
  </svg>
);

type AvatarStoryArgs = Omit<AvatarProps, "indicator"> & {
  indicatorEnabled?: boolean;
  indicatorColorScheme?:
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "blue"
    | "purple"
    | "pink"
    | "gray"
    | "white";
  indicatorSquared?: boolean;
  indicatorImage?: string;
};

const renderAvatar = (args: AvatarStoryArgs) => {
  const {
    indicatorEnabled,
    indicatorColorScheme,
    indicatorSquared,
    indicatorImage,
    ...avatarProps
  } = args;

  const indicator = indicatorEnabled
    ? {
        colorScheme: indicatorColorScheme,
        squared: indicatorSquared,
        image: indicatorImage,
      }
    : undefined;

  return <Avatar {...avatarProps} indicator={indicator} />;
};

export default {
  title: "Components/Avatar",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    size: {
      name: "Size",
      control: { type: "select" },
      options: ["16", "20", "24", "32", "40", "48", "64"],
      description: "Size of the avatar in pixels",
    },
    shape: {
      name: "Shape",
      control: { type: "radio" },
      options: ["circle", "square"],
      description: "Shape of the avatar",
    },
    src: {
      name: "Image URL",
      control: { type: "text" },
      description: "Image source URL",
    },
    alt: {
      name: "Alt Text",
      control: { type: "text" },
      description: "Alt text for the image",
    },
    fallback: {
      name: "Fallback",
      control: { type: "text" },
      description: "Fallback content (initials or icon)",
    },
    indicatorEnabled: {
      name: "Enabled",
      control: { type: "boolean" },
      description: "Enable or disable the status indicator",
      table: {
        category: "Indicator",
      },
    },
    indicatorColorScheme: {
      name: "Color Scheme",
      control: { type: "select" },
      options: [
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "purple",
        "pink",
        "gray",
        "white",
      ],
      description: "Color scheme of the status indicator",
      table: {
        category: "Indicator",
      },
      if: { arg: "indicatorEnabled" },
    },
    indicatorSquared: {
      name: "Squared",
      control: { type: "boolean" },
      description: "Whether the indicator is squared with border",
      table: {
        category: "Indicator",
      },
      if: { arg: "indicatorEnabled" },
    },
    indicatorImage: {
      name: "Image URL",
      control: { type: "text" },
      description: "Optional image URL to display in the indicator",
      table: {
        category: "Indicator",
      },
      if: { arg: "indicatorEnabled" },
    },
  },
  args: {
    size: "32",
    shape: "circle",
  },
} satisfies StoryDefault<AvatarStoryArgs>;

export const Default: Story<AvatarStoryArgs> = (args) => renderAvatar(args);
Default.args = {
  src: "https://i.pravatar.cc/300",
  alt: "User avatar",
  size: "32",
  shape: "circle",
  indicatorEnabled: true,
  indicatorColorScheme: "green",
  indicatorSquared: false,
};

export const WithInitials: Story<AvatarStoryArgs> = (args) =>
  renderAvatar(args);
WithInitials.args = {
  fallback: "AT",
  size: "32",
  shape: "circle",
};

export const WithIcon: Story<AvatarStoryArgs> = (args) => renderAvatar(args);
WithIcon.args = {
  fallback: UserIcon,
  size: "32",
  shape: "circle",
};

export const AllSizes: Story<AvatarStoryArgs> = (args) => (
  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
    <Avatar {...args} size="16" />
    <Avatar {...args} size="20" />
    <Avatar {...args} size="24" />
    <Avatar {...args} size="32" />
    <Avatar {...args} size="40" />
    <Avatar {...args} size="48" />
    <Avatar {...args} size="64" />
  </div>
);
AllSizes.args = {
  src: "https://i.pravatar.cc/300",
  shape: "circle",
};
