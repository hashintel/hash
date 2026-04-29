import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { formInputSizes } from "../../util/form-shared";
import { iconNames } from "../Icon/icon";
import {
  Button as ButtonComponent,
  type ButtonElementProps,
  type Tone,
  type Variant,
} from "./button";

const variants: Variant[] = ["solid", "subtle", "ghost", "link"];
const tones: Tone[] = ["neutral", "brand", "error"];

export default {
  title: "Components/Button",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: {
        type: "select",
        options: variants,
      },
    },
    tone: {
      control: {
        type: "select",
        options: [undefined, ...tones],
      },
    },
    size: {
      control: {
        type: "select",
        options: formInputSizes,
      },
    },
    iconName: {
      control: {
        type: "select",
        options: [undefined, ...iconNames],
      },
    },
    iconPosition: {
      control: {
        type: "select",
        options: ["left", "right"],
      },
    },
    loading: {
      control: { type: "boolean" },
    },
    disabled: {
      control: { type: "boolean" },
    },
    pressed: {
      control: { type: "boolean" },
    },
    shape: {
      control: {
        type: "select",
        options: ["default", "round"],
      },
    },
  },
  args: {
    children: "Button",
    variant: "solid",
    size: "md",
    disabled: false,
    loading: false,
  },
} satisfies StoryDefault<ButtonElementProps>;

const Button = (args: ButtonElementProps) => (
  <ButtonComponent {...args} onClick={() => {}}>
    {args.children ?? ""}
  </ButtonComponent>
);

export const Default: Story<ButtonElementProps> = (args) => (
  <>
    {tones.map((tone) => (
      <div
        key={tone}
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "4",
        })}
      >
        {variants.map((variant) => (
          <>
            <Button key={variant} {...args} variant={variant} tone={tone}>
              {variant}
            </Button>
            <Button
              key={`${variant}loading`}
              {...args}
              variant={variant}
              tone={tone}
              loading
            >
              {variant}
            </Button>
            <Button
              key={`${variant}disabled`}
              {...args}
              variant={variant}
              tone={tone}
              disabled
            >
              {variant}
            </Button>
            <Button
              key={`${variant}pressed`}
              {...args}
              variant={variant}
              tone={tone}
              pressed
            >
              {variant}
            </Button>
          </>
        ))}
      </div>
    ))}
  </>
);

Default.parameters = {
  controls: { exclude: ["variant", "tone", "loading", "pressed", "disabled"] },
};

export const Sizes: Story<ButtonElementProps> = (args) => (
  <>
    {variants.map((variant) => (
      <div
        key={variant}
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          marginBottom: "4",
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
            <div
              className={css({
                display: "flex",
                gap: "[4px]",
                alignItems: "center",
                marginBottom: "4",
              })}
            >
              <Button {...args} size={size} variant={variant}>
                {size}
              </Button>
              <Button {...args} size={size} variant={variant} loading>
                {size}
              </Button>
            </div>
            <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
              {size}
            </span>
          </div>
        ))}
      </div>
    ))}
  </>
);

Sizes.parameters = {
  controls: { exclude: ["size", "loading", "variant"] },
};

export const WithIcon: Story<ButtonElementProps> = (args) => (
  <>
    {variants.map((variant) => (
      <div
        key={variant}
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          marginBottom: "4",
        })}
      >
        <Button {...args} variant={variant} iconName="plus">
          Icon Left
        </Button>
        <Button
          {...args}
          variant={variant}
          iconName="arrowRight"
          iconPosition="right"
        >
          Icon Right
        </Button>
        <Button {...args} variant={variant} iconName="star">
          {undefined}
        </Button>
        <Button {...args} variant={variant} iconName="plus" loading>
          Icon Left
        </Button>
        <Button
          {...args}
          variant={variant}
          iconName="arrowRight"
          iconPosition="right"
          loading
        >
          Icon Right
        </Button>
        <Button {...args} variant={variant} iconName="star" loading>
          {undefined}
        </Button>
      </div>
    ))}
  </>
);

WithIcon.parameters = {
  controls: { exclude: ["iconName", "iconPosition", "variant", "loading"] },
};

export const Shape: Story<ButtonElementProps> = (args) => (
  <>
    {variants.map((variant) => (
      <div
        key={variant}
        className={css({
          display: "flex",
          gap: "[16px]",
          alignItems: "center",
          marginBottom: "4",
        })}
      >
        <Button {...args} variant={variant}>
          Default
        </Button>
        <Button {...args} shape="round" variant={variant}>
          Round
        </Button>
      </div>
    ))}
  </>
);
