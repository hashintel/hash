import { css } from "@hashintel/ds-helpers/css";
import type { Story, StoryDefault } from "@ladle/react";

import { formInputSizes } from "../../util/form-shared";
import { iconNames } from "../Icon/icon";
import {
  type AnchorElementProps,
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
  <Button {...args} />
);

export const Variants: Story<ButtonElementProps> = (args) => (
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
          <Button key={variant} {...args} variant={variant} tone={tone}>
            {variant}
          </Button>
        ))}
      </div>
    ))}
  </>
);

Variants.parameters = {
  controls: { exclude: ["variant", "tone"] },
};

export const Sizes: Story<ButtonElementProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[16px]",
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
        <Button {...args} size={size}>
          {size}
        </Button>
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

export const WithIcon: Story<ButtonElementProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[16px]",
      alignItems: "center",
    })}
  >
    <Button {...args} iconName="plus">
      Icon Left
    </Button>
    <Button {...args} iconName="arrowRight" iconPosition="right">
      Icon Right
    </Button>
    <Button {...args} iconName="star">
      {undefined}
    </Button>
  </div>
);

WithIcon.parameters = {
  controls: { exclude: ["iconName", "iconPosition"] },
};

export const Loading: Story<ButtonElementProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[16px]",
      alignItems: "center",
    })}
  >
    <Button {...args} loading>
      Loading
    </Button>
    <Button {...args} loading iconName="star">
      With Icon
    </Button>
  </div>
);

Loading.parameters = {
  controls: { exclude: ["loading"] },
};

export const Disabled: Story<ButtonElementProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[16px]",
      alignItems: "center",
      flexWrap: "wrap",
    })}
  >
    {variants.map((variant) => (
      <Button key={variant} {...args} variant={variant} disabled>
        {variant}
      </Button>
    ))}
  </div>
);

Disabled.parameters = {
  controls: { exclude: ["variant", "disabled"] },
};

export const AsLink: Story<AnchorElementProps> = () => (
  <div
    className={css({
      display: "flex",
      gap: "[16px]",
      alignItems: "center",
    })}
  >
    <ButtonComponent href="https://example.com">Internal Link</ButtonComponent>
    <ButtonComponent
      href="https://example.com"
      target="_blank"
      iconName="externalLink"
      iconPosition="right"
    >
      External Link
    </ButtonComponent>
  </div>
);
