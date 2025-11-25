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

const meta: Meta<AvatarProps> = {
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

The showIndicator prop displays a status badge in the bottom-right corner of the avatar, useful for showing online/active status.
        `,
      },
    },
  },
  argTypes: {
    size: {
      control: "select",
      options: ["16", "20", "24", "32", "40", "48", "64"],
      description: "Size of the avatar in pixels",
    },
    shape: {
      control: "radio",
      options: ["circle", "square"],
      description: "Shape of the avatar",
    },
    src: {
      control: "text",
      description: "Image source URL",
    },
    fallback: {
      control: "text",
      description: "Fallback content (initials or icon)",
    },
    showIndicator: {
      control: "boolean",
      description: "Show status indicator badge",
    },
  },
  args: {
    size: "32",
    shape: "circle",
  },
};

export default meta;
type Story = StoryObj<AvatarProps>;

export const WithImage: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    alt: "User avatar",
    size: "32",
    shape: "circle",
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

export const CircleShape: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "32",
    shape: "circle",
  },
};

export const SquareShape: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "32",
    shape: "square",
  },
};

export const Size16: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "16",
  },
};

export const Size20: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "20",
  },
};

export const Size24: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "24",
  },
};

export const Size32: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "32",
  },
};

export const Size40: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "40",
  },
};

export const Size48: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "48",
  },
};

export const Size64: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "64",
  },
};

export const AllSizesCircle: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar src="https://i.pravatar.cc/300" size="16" />
      <Avatar src="https://i.pravatar.cc/300" size="20" />
      <Avatar src="https://i.pravatar.cc/300" size="24" />
      <Avatar src="https://i.pravatar.cc/300" size="32" />
      <Avatar src="https://i.pravatar.cc/300" size="40" />
      <Avatar src="https://i.pravatar.cc/300" size="48" />
      <Avatar src="https://i.pravatar.cc/300" size="64" />
    </div>
  ),
};

export const AllSizesSquare: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar src="https://i.pravatar.cc/300" size="16" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="20" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="24" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="32" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="40" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="48" shape="square" />
      <Avatar src="https://i.pravatar.cc/300" size="64" shape="square" />
    </div>
  ),
};

export const InitialsFallback: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback="JD" size="16" />
      <Avatar fallback="AT" size="20" />
      <Avatar fallback="MK" size="24" />
      <Avatar fallback="RP" size="32" />
      <Avatar fallback="SL" size="40" />
      <Avatar fallback="TW" size="48" />
      <Avatar fallback="KB" size="64" />
    </div>
  ),
};

export const IconFallback: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback={UserIcon} size="16" />
      <Avatar fallback={UserIcon} size="20" />
      <Avatar fallback={UserIcon} size="24" />
      <Avatar fallback={UserIcon} size="32" />
      <Avatar fallback={UserIcon} size="40" />
      <Avatar fallback={UserIcon} size="48" />
      <Avatar fallback={UserIcon} size="64" />
    </div>
  ),
};

export const SquareWithInitials: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback="JD" size="16" shape="square" />
      <Avatar fallback="AT" size="20" shape="square" />
      <Avatar fallback="MK" size="24" shape="square" />
      <Avatar fallback="RP" size="32" shape="square" />
      <Avatar fallback="SL" size="40" shape="square" />
      <Avatar fallback="TW" size="48" shape="square" />
      <Avatar fallback="KB" size="64" shape="square" />
    </div>
  ),
};

export const SquareWithIcon: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback={UserIcon} size="16" shape="square" />
      <Avatar fallback={UserIcon} size="20" shape="square" />
      <Avatar fallback={UserIcon} size="24" shape="square" />
      <Avatar fallback={UserIcon} size="32" shape="square" />
      <Avatar fallback={UserIcon} size="40" shape="square" />
      <Avatar fallback={UserIcon} size="48" shape="square" />
      <Avatar fallback={UserIcon} size="64" shape="square" />
    </div>
  ),
};

export const BrokenImageFallback: Story = {
  args: {
    src: "https://broken-url.example.com/image.jpg",
    fallback: "FB",
    size: "48",
  },
};

export const WithIndicator: Story = {
  args: {
    src: "https://i.pravatar.cc/300",
    size: "32",
    showIndicator: true,
  },
};

export const IndicatorCircle: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar src="https://i.pravatar.cc/300" size="16" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="20" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="24" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="32" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="40" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="48" showIndicator />
      <Avatar src="https://i.pravatar.cc/300" size="64" showIndicator />
    </div>
  ),
};

export const IndicatorSquare: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar
        src="https://i.pravatar.cc/300"
        size="16"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="20"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="24"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="32"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="40"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="48"
        shape="square"
        showIndicator
      />
      <Avatar
        src="https://i.pravatar.cc/300"
        size="64"
        shape="square"
        showIndicator
      />
    </div>
  ),
};

export const IndicatorWithInitials: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback="JD" size="16" showIndicator />
      <Avatar fallback="AT" size="24" showIndicator />
      <Avatar fallback="MK" size="32" showIndicator />
      <Avatar fallback="RP" size="48" showIndicator />
      <Avatar fallback="SL" size="64" showIndicator />
    </div>
  ),
};

export const IndicatorWithIcon: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Avatar fallback={UserIcon} size="16" showIndicator />
      <Avatar fallback={UserIcon} size="24" showIndicator />
      <Avatar fallback={UserIcon} size="32" showIndicator />
      <Avatar fallback={UserIcon} size="48" showIndicator />
      <Avatar fallback={UserIcon} size="64" showIndicator />
    </div>
  ),
};
