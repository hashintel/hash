import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { formInputSizes } from "../../util/form-shared";
import type { LoadingSpinnerVariant } from "./loading-spinner";
import { LoadingSpinner } from "./loading-spinner";

type LoadingSpinnerProps = React.ComponentProps<typeof LoadingSpinner>;

const variants: LoadingSpinnerVariant[] = ["default", "bars"];

export default {
  title: "Components/LoadingSpinner",
  parameters: {
    layout: "centered",
  },
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
} satisfies StoryDefault<LoadingSpinnerProps>;

export const Default: Story<LoadingSpinnerProps> = (args) => (
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
);

Default.parameters = {
  controls: { exclude: ["size"] },
};

export const Bars: Story<LoadingSpinnerProps> = (args) => (
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
);

Bars.parameters = {
  controls: { exclude: ["size", "variant"] },
};
