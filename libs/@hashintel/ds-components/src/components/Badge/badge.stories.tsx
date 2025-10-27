import { css } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge, type BadgeProps } from "./badge";

const meta: Meta<BadgeProps> = {
  title: "Components/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# Badge Component

A lightweight badge component for displaying labels, counts, and status indicators.
Follows the design system with multiple color schemes and sizes.

## Variants

- **Color Schemes**: gray (default), brand, green, orange, red, purple, pink, yellow
- **Sizes**: xs (default), sm, md, lg
- **Shapes**: Rounded (default) or Square (for numeric badges)

## Use Cases

- Status indicators
- Category labels
- Notification counts
- Feature tags
        `,
      },
    },
  },
  argTypes: {
    colorScheme: {
      control: "select",
      options: [
        "gray",
        "brand",
        "green",
        "orange",
        "red",
        "purple",
        "pink",
        "yellow",
      ],
      description: "The color scheme of the badge",
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
      description: "The size of the badge",
    },
    isSquare: {
      control: "boolean",
      description: "Whether the badge is square (for numeric badges)",
    },
    children: {
      control: "text",
      description: "The content of the badge",
    },
  },
  args: {
    children: "Badge",
    colorScheme: "gray",
    size: "xs",
    isSquare: false,
  },
};

export default meta;
type Story = StoryObj<BadgeProps>;

export const Default: Story = {
  args: {
    children: "Badge",
  },
};

export const ColorSchemes: Story = {
  render: () => (
    <div
      className={css({
        display: "flex",
        gap: "[12px]",
        flexWrap: "wrap",
      })}
    >
      <Badge colorScheme="gray">Gray</Badge>
      <Badge colorScheme="brand">Brand</Badge>
      <Badge colorScheme="green">Green</Badge>
      <Badge colorScheme="orange">Orange</Badge>
      <Badge colorScheme="red">Red</Badge>
      <Badge colorScheme="purple">Purple</Badge>
      <Badge colorScheme="pink">Pink</Badge>
      <Badge colorScheme="yellow">Yellow</Badge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div
      className={css({
        display: "flex",
        gap: "[12px]",
        alignItems: "center",
        flexWrap: "wrap",
      })}
    >
      <Badge size="xs">Extra Small</Badge>
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

export const SquareBadges: Story = {
  render: () => (
    <div
      className={css({
        display: "flex",
        gap: "[12px]",
        alignItems: "center",
        flexWrap: "wrap",
      })}
    >
      <Badge isSquare size="xs">
        2
      </Badge>
      <Badge isSquare size="sm">
        5
      </Badge>
      <Badge isSquare size="md">
        9
      </Badge>
      <Badge isSquare size="lg">
        12
      </Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div
      className={css({
        display: "flex",
        gap: "[12px]",
        flexDirection: "column",
      })}
    >
      <div
        className={css({
          display: "flex",
          gap: "[12px]",
          flexWrap: "wrap",
        })}
      >
        <Badge
          size="sm"
          iconLeft={
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="6" cy="6" r="4" />
            </svg>
          }
        >
          With Left Icon
        </Badge>
        <Badge
          size="sm"
          iconRight={
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="6" cy="6" r="4" />
            </svg>
          }
        >
          With Right Icon
        </Badge>
        <Badge
          size="md"
          colorScheme="green"
          iconLeft={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M6.5 1L8 5h4l-3 3 1 4-3.5-2.5L3 12l1-4-3-3h4l1.5-4z" />
            </svg>
          }
        >
          Premium
        </Badge>
      </div>
    </div>
  ),
};

export const AllCombinations: Story = {
  render: () => {
    const colors: Array<BadgeProps["colorScheme"]> = [
      "gray",
      "brand",
      "green",
      "orange",
      "red",
      "purple",
      "pink",
      "yellow",
    ];
    const sizes: Array<BadgeProps["size"]> = ["xs", "sm", "md", "lg"];

    return (
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "[16px]",
        })}
      >
        {colors.map((color) => (
          <div
            key={color}
            className={css({
              display: "flex",
              gap: "[12px]",
              alignItems: "center",
            })}
          >
            <div
              className={css({
                width: "[80px]",
                fontSize: "[14px]",
                textTransform: "capitalize",
              })}
            >
              {color}:
            </div>
            {sizes.map((size) => (
              <Badge key={size} colorScheme={color} size={size}>
                {color}
              </Badge>
            ))}
            {sizes.map((size) => (
              <Badge
                key={`${size}-square`}
                colorScheme={color}
                size={size}
                isSquare
              >
                2
              </Badge>
            ))}
          </div>
        ))}
      </div>
    );
  },
};
