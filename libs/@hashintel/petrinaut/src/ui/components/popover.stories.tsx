import { css } from "@hashintel/ds-helpers/css";

import { Button } from "./button";
import { Popover } from "./popover";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components / Popover",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const contentWidthStyle = css({
  width: "[240px]",
});

const itemStyle = css({
  width: "[100%]",
  justifyContent: "flex-start",
  textAlign: "left",
});

export const Default: Story = {
  name: "Default",
  render: () => (
    <Popover.Root positioning={{ placement: "bottom", gutter: 8 }}>
      <Popover.Trigger asChild>
        <Button variant="subtle">Open Popover</Button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Settings</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Options</Popover.SectionLabel>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Option A
            </Button>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Option B
            </Button>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Option C
            </Button>
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
        <Button variant="subtle">Preferences</Button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Preferences</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Display</Popover.SectionLabel>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Light mode
            </Button>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Dark mode
            </Button>
          </Popover.SectionCard>
        </Popover.Section>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Language</Popover.SectionLabel>
            <Button variant="ghost" size="sm" className={itemStyle}>
              English
            </Button>
            <Button variant="ghost" size="sm" className={itemStyle}>
              French
            </Button>
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
        <Button variant="subtle">Open above</Button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Info</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Details</Popover.SectionLabel>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Item one
            </Button>
            <Button variant="ghost" size="sm" className={itemStyle}>
              Item two
            </Button>
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
        <Button variant="subtle">Already open</Button>
      </Popover.Trigger>
      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Popover</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Content</Popover.SectionLabel>
            <Button variant="ghost" size="sm" className={itemStyle}>
              This popover starts open
            </Button>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  ),
};
