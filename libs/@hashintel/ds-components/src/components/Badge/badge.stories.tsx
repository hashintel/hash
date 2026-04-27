import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { Badge, type BadgeProps } from "./badge";

export default {
  title: "Components/Badge",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    colorScheme: {
      control: { type: "select" },
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
      control: { type: "select" },
      options: ["xs", "sm", "md", "lg"],
      description: "The size of the badge",
    },
    isSquare: {
      control: { type: "boolean" },
      description: "Whether the badge is square (for numeric badges)",
    },
    children: {
      control: { type: "text" },
      description: "The content of the badge",
    },
  },
  args: {
    children: "Badge",
    colorScheme: "gray",
    size: "xs",
    isSquare: false,
  },
} satisfies StoryDefault<BadgeProps>;

export const Default: Story<BadgeProps> = (args) => <Badge {...args} />;
Default.args = {
  children: "Badge",
};

export const ColorSchemes: Story<BadgeProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[12px]",
      flexWrap: "wrap",
    })}
  >
    <Badge {...args} colorScheme="gray">
      Gray
    </Badge>
    <Badge {...args} colorScheme="brand">
      Brand
    </Badge>
    <Badge {...args} colorScheme="green">
      Green
    </Badge>
    <Badge {...args} colorScheme="orange">
      Orange
    </Badge>
    <Badge {...args} colorScheme="red">
      Red
    </Badge>
    <Badge {...args} colorScheme="purple">
      Purple
    </Badge>
    <Badge {...args} colorScheme="pink">
      Pink
    </Badge>
    <Badge {...args} colorScheme="yellow">
      Yellow
    </Badge>
  </div>
);
ColorSchemes.parameters = {
  controls: { exclude: ["children", "colorScheme"] },
};

export const Sizes: Story<BadgeProps> = () => (
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
);
Sizes.parameters = {
  controls: { exclude: ["children", "size", "isSquare"] },
};

export const SquareBadges: Story<BadgeProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[12px]",
      alignItems: "center",
      flexWrap: "wrap",
    })}
  >
    <Badge {...args} isSquare size="xs">
      2
    </Badge>
    <Badge {...args} isSquare size="sm">
      5
    </Badge>
    <Badge {...args} isSquare size="md">
      9
    </Badge>
    <Badge {...args} isSquare size="lg">
      12
    </Badge>
  </div>
);
SquareBadges.parameters = {
  controls: { exclude: ["children", "size", "isSquare"] },
};

export const WithIcons: Story<BadgeProps> = (args) => (
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
        {...args}
        iconLeft={
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r="4" />
          </svg>
        }
      >
        With Left Icon
      </Badge>
      <Badge
        {...args}
        iconRight={
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r="4" />
          </svg>
        }
      >
        With Right Icon
      </Badge>
      <Badge
        {...args}
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
);
WithIcons.parameters = {
  controls: { exclude: ["children"] },
};

export const AllCombinations: Story<BadgeProps> = () => {
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
            {color}
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
};
AllCombinations.parameters = {
  controls: { disabled: true },
};
