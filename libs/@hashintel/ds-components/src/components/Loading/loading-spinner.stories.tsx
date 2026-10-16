import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { LoadingSpinner } from "./loading-spinner";

import type { LoadingSpinnerVariant } from "./loading-spinner";
import type { Meta, StoryObj } from "@storybook/react-vite";

type LoadingSpinnerProps = React.ComponentProps<typeof LoadingSpinner>;

const variants: LoadingSpinnerVariant[] = ["default", "bars"];

const meta = {
  title: "Components/LoadingSpinner",
  argTypes: {
    size: {
      control: { type: "select" },
      options: formInputSizes,
      description: "The size of the spinner",
    },
    variant: {
      control: { type: "select" },
      options: variants,
      description: "The visual variant of the spinner",
    },
  },
  args: {
    size: "md",
    variant: "default",
  },
} satisfies Meta<LoadingSpinnerProps>;

export default meta;

type Story = StoryObj<LoadingSpinnerProps>;

export const Default: Story = {
  render: (args: LoadingSpinnerProps) => (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[24px]",
      })}
    >
      <div
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
        })}
      >
        {formInputSizes.map((size) => (
          <LoadingSpinner {...args} key={size} size={size} />
        ))}
      </div>
      <div
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          backgroundColor: "black",
          padding: "[16px]",
          borderRadius: "[8px]",
          color: "white",
        })}
      >
        {formInputSizes.map((size) => (
          <LoadingSpinner {...args} key={size} size={size} />
        ))}
      </div>
    </div>
  ),
};
export const Bars: Story = {
  render: (args: LoadingSpinnerProps) => (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[24px]",
      })}
    >
      <div
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
        })}
      >
        {formInputSizes.map((size) => (
          <LoadingSpinner {...args} key={size} size={size} variant="bars" />
        ))}
      </div>
      <div
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          backgroundColor: "black",
          padding: "[16px]",
          borderRadius: "[8px]",
          color: "white",
        })}
      >
        {formInputSizes.map((size) => (
          <LoadingSpinner {...args} key={size} size={size} variant="bars" />
        ))}
      </div>
    </div>
  ),
};
