import { Fragment } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { CharacterCount } from "./character-count";

import type { Story, StoryDefault } from "@ladle/react";

export default {
  title: "Components/CharacterCount",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    charactersUsed: { control: { type: "number" } },
    maxLength: { control: { type: "number" } },
    takesHeight: { control: { type: "boolean" } },
  },
  args: {
    charactersUsed: 45,
    maxLength: 100,
    takesHeight: true,
  },
} satisfies StoryDefault<React.ComponentProps<typeof CharacterCount>>;

const headingClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s90",
});

const labelClass = css({
  fontSize: "[12px]",
  color: "neutral.s80",
});

// Each example uses the same limit so it is easy to compare the transition from
// under-limit (subtle) to over-limit (highlighted).
const states: { label: string; charactersUsed: number; maxLength: number }[] = [
  { label: "Empty", charactersUsed: 0, maxLength: 100 },
  { label: "Under limit", charactersUsed: 45, maxLength: 100 },
  { label: "At limit", charactersUsed: 100, maxLength: 100 },
  { label: "Over limit", charactersUsed: 112, maxLength: 100 },
];

export const Default: Story<
  React.ComponentProps<typeof CharacterCount>
> = () => (
  <div
    className={css({
      display: "grid",
      gridTemplateColumns: "[max-content max-content]",
      alignItems: "center",
      columnGap: "[32px]",
      rowGap: "[12px]",
    })}
  >
    <span className={headingClass}>State</span>
    <span className={headingClass}>Counter</span>
    {states.map(({ label, charactersUsed, maxLength }) => (
      <Fragment key={label}>
        <span className={labelClass}>{label}</span>
        <CharacterCount
          charactersUsed={charactersUsed}
          maxLength={maxLength}
          takesHeight
        />
      </Fragment>
    ))}
  </div>
);

Default.parameters = {
  actions: { disable: true },
  interactions: { disable: true },
  controls: { disable: true },
};
