import { css, type Styles } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { Icon, iconNames, sizes } from "./icon";

export default {
  title: "Components/Icon",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    name: {
      control: {
        type: "select",
        options: iconNames,
      },
    },
    size: {
      control: {
        type: "select",
        options: sizes,
      },
    },
    alt: {
      control: { type: "text" },
    },
  },
  args: {
    name: "star",
    size: "md",
  },
} satisfies StoryDefault<React.ComponentProps<typeof Icon>>;

export const Default: Story<React.ComponentProps<typeof Icon>> = (args) => (
  <Icon {...args} />
);

export const Sizes: Story<React.ComponentProps<typeof Icon>> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[24px]",
      alignItems: "center",
    })}
  >
    {sizes.map((size) => (
      <div
        key={size}
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "[8px]",
        })}
      >
        <Icon {...args} size={size} />
        <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
          {size}
        </span>
      </div>
    ))}
  </div>
);

Sizes.parameters = {
  controls: { exclude: ["size"] },
};

const iconGrid = (args: React.ComponentProps<typeof Icon>, styles?: Styles) => (
  <div
    className={css({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
      gap: "[16px]",
      ...styles,
    })}
  >
    {iconNames.map((name) => (
      <div
        key={name}
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "[8px]",
          padding: "[12px]",
          borderRadius: "[8px]",
          _hover: {
            backgroundColor: "neutral.s30",
          },
        })}
      >
        <Icon {...args} name={name} />
        <span
          className={css({
            fontSize: "[10px]",
            color: "neutral.s80",
            textAlign: "center",
            wordBreak: "break-all",
          })}
        >
          {name}
        </span>
      </div>
    ))}
  </div>
);

export const AllIcons: Story<React.ComponentProps<typeof Icon>> = (args) =>
  iconGrid(args);
AllIcons.parameters = {
  controls: { exclude: ["name"], disabled: true },
};

export const ColoredIcons: Story<React.ComponentProps<typeof Icon>> = (args) =>
  iconGrid(args, { color: "red.s80" });
ColoredIcons.parameters = {
  controls: { exclude: ["name"], disabled: true },
};
