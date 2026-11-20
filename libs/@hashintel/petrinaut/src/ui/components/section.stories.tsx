import { Section, SectionList } from "./section";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Section",
  component: Section,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Properties",
    tooltip: "",
    collapsible: false,
    children: "Section content",
  },
} satisfies Meta<typeof Section>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** One section with a tooltip, one that starts collapsed. */
export const List: Story = {
  name: "SectionList",
  render: () => (
    <SectionList>
      <Section title="General">General settings</Section>
      <Section title="Initial State" tooltip="The starting token distribution">
        Content with a tooltip on the header
      </Section>
      <Section title="Advanced" collapsible defaultOpen={false}>
        Advanced configuration
      </Section>
    </SectionList>
  ),
};
