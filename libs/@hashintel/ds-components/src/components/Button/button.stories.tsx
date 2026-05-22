import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { Icon, iconNames } from "../Icon/icon";
import {
  Button as ButtonComponent,
  type ButtonElementProps,
  iconSizeMap,
  type Tone,
  type Variant,
} from "./button";

import type { Story, StoryDefault } from "@ladle/react";

const variants: Variant[] = ["solid", "subtle", "ghost", "link", "linkSubtle"];
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
  <ButtonComponent {...args} onClick={args.onClick ?? (() => {})}>
    {args.children ?? ""}
  </ButtonComponent>
);

export const Default: Story<ButtonElementProps> = (args) => {
  const [loading, setLoading] = useState<string | null>(null);
  return (
    <>
      {tones.map((tone) => (
        <div
          key={tone}
          className={css({
            display: "flex",
            gap: "[16px]",
            alignItems: "flex-end",
            flexWrap: "wrap",
            marginBottom: "4",
          })}
        >
          {variants.map((variant) => (
            <Fragment key={variant}>
              <Button
                {...args}
                variant={variant}
                tone={tone}
                onClick={() => {
                  setLoading(`${variant}-${tone}`);
                  setTimeout(() => setLoading(null), 1000);
                }}
                loading={loading === `${variant}-${tone}`}
              >
                {variant}
              </Button>
              <Button {...args} variant={variant} tone={tone} loading>
                {variant}
              </Button>
              <Button {...args} variant={variant} tone={tone} disabled>
                disabled
              </Button>
              <Button {...args} variant={variant} tone={tone} pressed>
                pressed
              </Button>
            </Fragment>
          ))}
        </div>
      ))}
    </>
  );
};

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
          flexWrap: "wrap",
        })}
      >
        {formInputSizes.map((size) => (
          <Fragment key={size}>
            {/* eslint-disable -- spreading union-typed Ladle args triggers false TS errors from RequireAtLeastOne/ExclusifyUnion distribution */}
            <Button
              {...(args as any)}
              variant={variant}
              iconName="plus"
              size={size}
            >
              Icon Left
            </Button>
            <Button
              {...(args as any)}
              variant={variant}
              iconName="arrowRight"
              iconPosition="right"
              size={size}
            >
              Icon Right
            </Button>
            <ButtonComponent
              {...(args as any)}
              variant={variant}
              size={size}
              prefix={<Icon name="plus" size={iconSizeMap[size]} />}
              suffix={<Icon name="arrowRight" size={iconSizeMap[size]} />}
              onClick={() => {}}
            >
              Both Icons
            </ButtonComponent>
            <Button
              {...(args as any)}
              variant={variant}
              iconName="star"
              size={size}
              tooltip="Star"
            >
              {undefined}
            </Button>
            <ButtonComponent
              {...(args as any)}
              variant={variant}
              size={size}
              prefix={<Icon name="plus" size={iconSizeMap[size]} />}
              suffix={<Icon name="arrowRight" size={iconSizeMap[size]} />}
              onClick={() => {}}
              tooltip="Icon only with prefix and suffix"
            >
              {undefined}
            </ButtonComponent>
            {/* eslint-enable */}
          </Fragment>
        ))}
        <Button
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- same union spread issue */
          {...(args as any)}
          variant={variant}
          iconName="star"
          loading
          tooltip="Star"
        >
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
