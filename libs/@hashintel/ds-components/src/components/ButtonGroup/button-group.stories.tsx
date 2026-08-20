import { css } from "@hashintel/ds-helpers/css";

import { type FormInputSize, formInputSizes } from "../../util/form-shared";
import { Button } from "../Button/button";
import { ButtonGroup } from "./button-group";

import type { Story, StoryDefault } from "@ladle/react";

type ButtonGroupProps = React.ComponentProps<typeof ButtonGroup>;

const variants: NonNullable<ButtonGroupProps["variant"]>[] = [
  "spaced",
  "segmented",
];

const alignments: NonNullable<ButtonGroupProps["alignedTo"]>[] = [
  "left",
  "right",
];

type ButtonVariant = NonNullable<
  React.ComponentProps<typeof Button>["variant"]
>;

const buttonVariants: ButtonVariant[] = ["solid", "subtle", "ghost"];

// Every unordered pair of distinct button variants, so the edge-case segmented
// group places each variant next to each other variant at least once.
const mixedVariantPairs = buttonVariants.flatMap((first, index) =>
  buttonVariants.slice(index + 1).map((second) => [first, second] as const),
);

export default {
  title: "Components/ButtonGroup",
} satisfies StoryDefault<ButtonGroupProps>;

const pageClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "[40px]",
});

const sectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "[16px]",
});

const sectionHeadingClass = css({
  fontSize: "[13px]",
  fontWeight: "semibold",
  color: "neutral.s100",
});

const rowClass = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "[24px]",
  alignItems: "flex-start",
});

// Tighter layout for the frameless "normal & reversed" examples.
const compactRowsClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "[10px]",
});

const tightRowClass = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "[16px]",
  alignItems: "flex-start",
});

const exampleClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "[8px]",
});

const labelClass = css({
  fontSize: "[12px]",
  color: "neutral.s80",
});

// Fixed-width dashed frame: exposes the group's full width and is narrow enough
// that the six-button examples wrap onto two lines.
const frameClass = css({
  width: "[300px]",
  border: "[1px dashed]",
  borderColor: "neutral.s40",
  borderRadius: "[8px]",
  padding: "[12px]",
});

const shortLabels = ["One", "Two", "Three"];
const manyLabels = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];

const buttons = (
  labels: string[],
  variant: ButtonVariant = "subtle",
  size?: FormInputSize,
) =>
  labels.map((label, index) => (
    <Button key={label} variant={variant} size={size} pressed={index === 0}>
      {label}
    </Button>
  ));

const Example = ({
  label,
  framed = true,
  children,
}: {
  label: string;
  framed?: boolean;
  children: React.ReactNode;
}) => (
  <div className={exampleClass}>
    <span className={labelClass}>{label}</span>
    {framed ? <div className={frameClass}>{children}</div> : children}
  </div>
);

export const Default: Story = () => (
  <div className={pageClass}>
    <section className={sectionClass}>
      <div className={compactRowsClass}>
        {variants.map((variant) => (
          <div key={variant} className={tightRowClass}>
            <Example framed={false} label={`${variant} · normal`}>
              <ButtonGroup variant={variant}>
                {buttons(shortLabels)}
              </ButtonGroup>
            </Example>
            <Example framed={false} label={`${variant} · reversed`}>
              <ButtonGroup variant={variant} reverse>
                {buttons(shortLabels)}
              </ButtonGroup>
            </Example>
          </div>
        ))}
      </div>
    </section>

    <section className={sectionClass}>
      <span className={sectionHeadingClass}>Wrapping onto two lines</span>
      <div className={rowClass}>
        {variants.map((variant) =>
          alignments.map((alignedTo) => (
            <Example
              key={`${alignedTo}-${variant}`}
              label={`${variant} · alignedTo=${alignedTo}`}
            >
              <ButtonGroup variant={variant} alignedTo={alignedTo}>
                {buttons(manyLabels)}
              </ButtonGroup>
            </Example>
          )),
        )}
      </div>
    </section>
  </div>
);

export const Spacing: Story = () => (
  <div className={pageClass}>
    <section className={sectionClass}>
      <span className={sectionHeadingClass}>spaced · all spacing sizes</span>
      <div className={compactRowsClass}>
        {formInputSizes.map((spacing) => (
          <Example key={spacing} framed={false} label={`spacing=${spacing}`}>
            <ButtonGroup variant="spaced" spacing={spacing}>
              {buttons(shortLabels, "subtle", spacing)}
            </ButtonGroup>
          </Example>
        ))}
      </div>
    </section>
  </div>
);

export const Variants: Story = () => (
  <div className={pageClass}>
    {buttonVariants.map((buttonVariant) => (
      <section key={buttonVariant} className={sectionClass}>
        <span className={sectionHeadingClass}>
          Button variant={buttonVariant}
        </span>
        <div className={tightRowClass}>
          {variants.map((variant) => (
            <Example key={variant} framed={false} label={variant}>
              <ButtonGroup variant={variant}>
                {buttons(shortLabels, buttonVariant)}
              </ButtonGroup>
            </Example>
          ))}
        </div>
      </section>
    ))}

    <section className={sectionClass}>
      <span className={sectionHeadingClass}>edge-case: segmented mixed</span>
      <ButtonGroup variant="segmented">
        {mixedVariantPairs.flatMap(([first, second]) => [
          <Button key={`${first}-${second}-left`} variant={first}>
            {first}
          </Button>,
          <Button key={`${first}-${second}-right`} variant={second}>
            {second}
          </Button>,
        ])}
      </ButtonGroup>
    </section>
  </div>
);
