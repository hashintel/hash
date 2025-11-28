import type { Meta, StoryObj } from "@storybook/react-vite";

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

const meta: Meta<AvatarStoryArgs> = {
  title: "Components/Avatar",
  component: Avatar,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# Avatar Component

A versatile avatar component built with @ark-ui/react and styled with PandaCSS.
Displays user profile images with fallback support for initials or icons.

## Features

- **Multiple Sizes**: 16px, 20px, 24px, 32px, 40px, 48px, 64px
- **Two Shapes**: Circle (default) or square
- **Fallback Support**: Automatically shows fallback content when image fails to load
- **Image Loading States**: Built-in handling of loading and error states

## Types

- **Image**: Displays a profile photo
- **Initials**: Shows account name initials as fallback
- **Icon**: Displays an icon as fallback

## Indicator

The indicator prop displays a status badge in the bottom-right corner of the avatar, useful for showing online/active status.
        `,
      },
    },
  },
  argTypes: {
    size: {
      name: "Size",
      control: "select",
      options: ["16", "20", "24", "32", "40", "48", "64"],
      description: "Size of the avatar in pixels",
    },
    shape: {
      name: "Shape",
      control: "radio",
      options: ["circle", "square"],
      description: "Shape of the avatar",
    },
    src: {
      name: "Image URL",
      control: "text",
      description: "Image source URL",
    },
    alt: {
      name: "Alt Text",
      control: "text",
      description: "Alt text for the image",
    },
    fallback: {
      name: "Fallback",
      control: "text",
      description: "Fallback content (initials or icon)",
    },
    indicatorEnabled: {
      name: "Enabled",
      control: "boolean",
      description: "Enable or disable the status indicator",
      table: {
        category: "Indicator",
      },
    },
    indicatorColorScheme: {
      name: "Color Scheme",
      control: "select",
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
      control: "boolean",
      description: "Whether the indicator is squared with border",
      table: {
        category: "Indicator",
      },
      if: { arg: "indicatorEnabled" },
    },
    indicatorImage: {
      name: "Image URL",
      control: "text",
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
  render: (args) => {
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
  },
};

export default meta;
type Story = StoryObj<AvatarStoryArgs>;

export const Default: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    alt: "User avatar",
    size: "32",
    shape: "circle",
    indicatorEnabled: true,
    indicatorColorScheme: "green",
    indicatorSquared: false,
  },
};

export const WithInitials: Story = {
  args: {
    fallback: "AT",
    size: "32",
    shape: "circle",
  },
};

export const WithIcon: Story = {
  args: {
    fallback: UserIcon,
    size: "32",
    shape: "circle",
  },
};

export const AllSizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar {...args} size="16" />
      <Avatar {...args} size="20" />
      <Avatar {...args} size="24" />
      <Avatar {...args} size="32" />
      <Avatar {...args} size="40" />
      <Avatar {...args} size="48" />
      <Avatar {...args} size="64" />
    </div>
  ),
  args: {
    src: "https://i.pravatar.cc/300",
    shape: "circle",
  },
  argTypes: {
    size: {
      control: false,
    },
  },
};
