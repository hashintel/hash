import { css, type Styles } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Icon } from "./icon";
import { iconNames } from "./icon-util";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Icon",
  component: Icon,
  args: {
    name: "star",
    size: "md",
  },
} satisfies Meta<React.ComponentProps<typeof Icon>>;

export default meta;

type Story = StoryObj<React.ComponentProps<typeof Icon>>;

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

export const Default: Story = {
  render: (args: React.ComponentProps<typeof Icon>) => iconGrid(args),
};

export const Sizes: Story = {
  render: (args: React.ComponentProps<typeof Icon>) => (
    <div
      className={css({
        display: "flex",
        gap: "[24px]",
        alignItems: "center",
      })}
    >
      {formInputSizes.map((size) => (
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

export const ColoredIcons: Story = {
  render: (args: React.ComponentProps<typeof Icon>) =>
    iconGrid(args, { color: "red.s80" }),
};
