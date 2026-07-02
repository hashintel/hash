import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { TextArea } from "./text-area";

import type { Story, StoryDefault } from "@ladle/react";

type TextAreaProps = React.ComponentProps<typeof TextArea>;

const sampleText =
  "The quick brown fox jumps over the lazy dog.\nAnd then it does it again on a second line.";

const Controlled = (props: Omit<TextAreaProps, "onChange">) => {
  const [value, setValue] = useState(String(props.value ?? ""));
  return (
    <TextArea {...props} value={value} onChange={(val) => setValue(val)} />
  );
};

const headingClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s90",
});

const labelClass = css({
  fontSize: "[12px]",
  color: "neutral.s80",
});

// subtle grey backdrop (matches the TextInput stories) so the transparent
// `subtle` variant is visible
const backdrop = {
  background: "neutral.s10",
  padding: "[24px]",
} as const;

const gridClass = css({
  ...backdrop,
  display: "grid",
  gridTemplateColumns: "[max-content minmax(0, 320px)]",
  alignItems: "start",
  columnGap: "[32px]",
  rowGap: "[16px]",
  maxWidth: "[420px]",
});

const statesGridClass = css({
  ...backdrop,
  display: "grid",
  gridTemplateColumns: "[max-content minmax(0, 260px) minmax(0, 260px)]",
  alignItems: "start",
  columnGap: "[32px]",
  rowGap: "[16px]",
  maxWidth: "[640px]",
});

const sizesGridClass = css({
  ...backdrop,
  display: "grid",
  gridTemplateColumns:
    "[max-content minmax(0, 220px) minmax(0, 220px) minmax(0, 220px)]",
  alignItems: "start",
  columnGap: "[32px]",
  rowGap: "[16px]",
  maxWidth: "[760px]",
});

// Each state is rendered once per variant, so the default and subtle
// treatments can be compared side by side.
const states: {
  label: string;
  props: Omit<TextAreaProps, "onChange" | "variant">;
}[] = [
  { label: "Default", props: { value: sampleText } },
  {
    label: "Placeholder",
    props: { value: "", placeholder: "Write a description…" },
  },
  { label: "Invalid", props: { value: sampleText, invalid: true } },
  { label: "Disabled", props: { value: sampleText, disabled: true } },
  { label: "Readonly", props: { value: sampleText, readonly: true } },
];

// The manual resize directions plus the content-driven `autoResize` mode.
const resizeCases: {
  label: string;
  props: Pick<TextAreaProps, "resize" | "autoResize">;
}[] = [
  { label: "none", props: { resize: "none" } },
  { label: "vertical", props: { resize: "vertical" } },
  { label: "horizontal", props: { resize: "horizontal" } },
  { label: "both", props: { resize: "both" } },
  { label: "autoResize", props: { autoResize: true } },
];

export default {
  title: "Components/TextArea",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={statesGridClass}>
    <span className={headingClass}>State</span>
    <span className={headingClass}>Default</span>
    <span className={headingClass}>Subtle</span>
    {states.map(({ label, props }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <Controlled {...props} variant="default" />
        <Controlled {...props} variant="subtle" />
      </Fragment>
    ))}
  </div>
);

export const Sizes: Story = () => (
  <div className={sizesGridClass}>
    <span className={headingClass}>Size</span>
    <span className={headingClass}>Default</span>
    <span className={headingClass}>Subtle</span>
    <span className={headingClass}>Readonly</span>
    {formInputSizes.map((size) => (
      <Fragment key={size}>
        <span className={labelClass}>{size}</span>
        <Controlled
          size={size}
          value={sampleText}
          placeholder="Type something…"
        />
        <Controlled
          size={size}
          variant="subtle"
          value={sampleText}
          placeholder="Type something…"
        />
        <Controlled size={size} value={sampleText} readonly />
      </Fragment>
    ))}
  </div>
);

export const Resize: Story = () => (
  <div className={gridClass}>
    <span className={headingClass}>resize</span>
    <span className={headingClass}>TextArea</span>
    {resizeCases.map(({ label, props }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <Controlled {...props} value={sampleText} rows={2} />
      </Fragment>
    ))}
  </div>
);

export const WithCharacterCount: Story = () => (
  <div
    className={css({
      ...backdrop,
      display: "flex",
      flexDirection: "column",
      gap: "[24px]",
      maxWidth: "[420px]",
    })}
  >
    {(["default", "subtle"] as const).flatMap((variant) =>
      ([true, false] as const).map((includeCharCountHeight) => (
        <div
          key={`${variant}-${includeCharCountHeight}`}
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "[8px]",
          })}
        >
          <span className={labelClass}>
            {variant} — includeCharCountHeight: {String(includeCharCountHeight)}
          </span>
          <Controlled
            variant={variant}
            includeCharCountHeight={includeCharCountHeight}
            value="A short bio."
            characterLimit={80}
            rows={3}
            placeholder="Tell us about yourself…"
          />
        </div>
      )),
    )}
  </div>
);
