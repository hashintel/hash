import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { formInputSizes } from "../../util/form-shared";
import { LoadingSpinner } from "./loading-spinner";

type LoadingSpinnerProps = React.ComponentProps<typeof LoadingSpinner>;

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
  },
  args: {
    size: "md",
  },
} satisfies StoryDefault<LoadingSpinnerProps>;

export const Default: Story<LoadingSpinnerProps> = (args) => (
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
);

Default.parameters = {
  controls: { exclude: ["size"] },
};
