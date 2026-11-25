import { css } from "@hashintel/ds-helpers/css";

import { Kbd, type KbdProps } from "./kbd";

import type { Meta, StoryObj } from "@storybook/react-vite";

const platforms = [
  "auto",
  "apple",
  "pc",
] as const satisfies readonly NonNullable<KbdProps["platform"]>[];

// Keys whose label differs between Apple and PC keyboards, then an arrow, a
// function key, an accented and a non-Latin character, then combinations
// showing each platform's modifier order and separator
const platformKeys = [
  "mod",
  "meta",
  "ctrl",
  "alt",
  "shift",
  "enter",
  "backspace",
  "delete",
  "tab",
  "up",
  "f2",
  "é",
  "ж",
  "mod+shift+z",
  "ctrl+alt+shift+meta+k",
];

const variants = ["neutral", "inherit"] as const satisfies readonly NonNullable<
  KbdProps["variant"]
>[];

const sectionsStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
});

const headingStyles = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.heading",
  marginBottom: "3",
});

const examplesStyles = css({
  display: "grid",
  gridTemplateColumns: "[max-content max-content]",
  alignItems: "center",
  columnGap: "6",
  rowGap: "3",
});

// Fills column by column: a header row of keys, then one row per platform
const platformExamplesStyles = css({
  display: "grid",
  gridAutoFlow: "column",
  gridTemplateRows: "[repeat(4, max-content)]",
  gridAutoColumns: "max",
  alignItems: "center",
  columnGap: "5",
  rowGap: "3",
});

const exampleStyles = css({ display: "contents" });

const labelStyles = css({
  textStyle: "xs",
  fontFamily: "mono",
  color: "fg.muted",
});

const solidSurfaceStyles = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "md",
  backgroundColor: "neutral.s120",
  color: "white",
});

const textStyles = css({
  textStyle: "sm",
  color: "fg.body",
});

const meta = {
  title: "Components/Kbd",
  component: Kbd,
  args: {
    keys: "mod+shift+k",
    variant: "neutral",
    platform: "auto",
  },
} satisfies Meta<KbdProps>;

export default meta;

type Story = StoryObj<KbdProps>;

export const Default: Story = {
  render: (args: KbdProps) => (
    <div className={sectionsStyles}>
      <section>
        <h3 className={headingStyles}>Platforms</h3>
        <div className={platformExamplesStyles}>
          <span />
          {platforms.map((platform) => (
            <span key={platform} className={labelStyles}>
              platform=&quot;{platform}&quot;
            </span>
          ))}
          {platformKeys.map((keys) => (
            <div key={keys} className={exampleStyles}>
              <span className={labelStyles}>{keys}</span>
              {platforms.map((platform) => (
                <Kbd {...args} key={platform} keys={keys} platform={platform} />
              ))}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className={headingStyles}>Variants</h3>
        <div className={examplesStyles}>
          {variants.map((variant) => (
            <div key={variant} className={exampleStyles}>
              <span className={labelStyles}>variant=&quot;{variant}&quot;</span>
              <span
                className={
                  variant === "inherit" ? solidSurfaceStyles : undefined
                }
              >
                <Kbd {...args} variant={variant} />
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className={headingStyles}>In text</h3>
        <p className={textStyles}>
          Press <Kbd {...args} /> to open the command palette, or{" "}
          <Kbd {...args} keys="escape" /> to close it.
        </p>
      </section>
    </div>
  ),
};
