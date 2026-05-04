import { css } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Popover } from "./popover";

const meta = {
  title: "Components / Popover",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const triggerButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[32px]",
  paddingX: "[12px]",
  fontSize: "[14px]",
  fontWeight: "medium",
  color: "neutral.s120",
  backgroundColor: "[white]",
  border: "[1px solid]",
  borderColor: "neutral.s30",
  borderRadius: "[8px]",
  cursor: "pointer",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

const contentWidthStyle = css({
  width: "[240px]",
});

const itemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  width: "[100%]",
  height: "[28px]",
  paddingX: "[8px]",
  borderRadius: "[8px]",
  fontSize: "[14px]",
  fontWeight: "medium",
  color: "neutral.s120",
  backgroundColor: "[transparent]",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

export const Default: Story = {
  name: "Default",
  render: () => (
    <Popover.Root positioning={{ placement: "bottom", gutter: 8 }}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerButtonStyle}>
          Open Popover
        </button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Settings</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Options</Popover.SectionLabel>
            <button type="button" className={itemStyle}>
              Option A
            </button>
            <button type="button" className={itemStyle}>
              Option B
            </button>
            <button type="button" className={itemStyle}>
              Option C
            </button>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  ),
};

export const MultipleSections: Story = {
  name: "Multiple sections",
  render: () => (
    <Popover.Root positioning={{ placement: "bottom", gutter: 8 }}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerButtonStyle}>
          Preferences
        </button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Preferences</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Display</Popover.SectionLabel>
            <button type="button" className={itemStyle}>
              Light mode
            </button>
            <button type="button" className={itemStyle}>
              Dark mode
            </button>
          </Popover.SectionCard>
        </Popover.Section>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Language</Popover.SectionLabel>
            <button type="button" className={itemStyle}>
              English
            </button>
            <button type="button" className={itemStyle}>
              French
            </button>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  ),
};

export const TopPlacement: Story = {
  name: "Top placement",
  render: () => (
    <Popover.Root positioning={{ placement: "top", gutter: 8 }}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerButtonStyle}>
          Open above
        </button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Info</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Details</Popover.SectionLabel>
            <button type="button" className={itemStyle}>
              Item one
            </button>
            <button type="button" className={itemStyle}>
              Item two
            </button>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  ),
};

export const OpenByDefault: Story = {
  name: "Open by default",
  render: () => (
    <Popover.Root defaultOpen positioning={{ placement: "bottom", gutter: 8 }}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerButtonStyle}>
          Already open
        </button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Popover</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Content</Popover.SectionLabel>
            <button type="button" className={itemStyle}>
              This popover starts open
            </button>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  ),
};
