import { css, type Styles } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Icon, iconNames, sizes } from "./Icon";

const meta: Meta<typeof Icon> = {
  title: "Components/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    name: {
      control: "select",
      options: iconNames,
    },
    size: {
      control: "select",
      options: sizes,
    },
    alt: {
      control: "text",
    },
  },
  args: {
    name: "star",
    size: "md",
  },
};

export default meta;
type Story = StoryObj<typeof Icon>;

export const Default: Story = {};

export const Sizes: Story = {
  parameters: {
    controls: { exclude: ["size"] },
  },
  render: (args) => (
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
  ),
};

const iconGrid = (styles?: Styles) => (
  <div
    className={css({
      display: "grid",
      gridTemplateColumns: "repeat(8, 1fr)",
      gap: "[16px]",
      maxWidth: "[720px]",
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
        <Icon name={name} size="md" />
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

export const AllIcons: Story = {
  parameters: {
    controls: { exclude: ["name"], disabled: true },
  },
  render: () => iconGrid(),
};

export const ColoredIcons: Story = {
  parameters: {
    controls: { exclude: ["name"], disabled: true },
  },
  render: () => iconGrid({ color: "red.s80" }),
};
