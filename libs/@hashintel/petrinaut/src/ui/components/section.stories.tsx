import type { Meta, StoryObj } from "@storybook/react-vite";

import { Section, SectionList } from "./section";

const meta = {
  title: "Components / Section",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const Container = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 280 }}>{children}</div>
);

const Placeholder = ({ label }: { label: string }) => (
  <div
    style={{
      padding: 12,
      borderRadius: 4,
      backgroundColor: "#f5f5f5",
      fontSize: 12,
      color: "#888",
    }}
  >
    {label}
  </div>
);

export const Default: Story = {
  name: "Default",
  render: () => (
    <Container>
      <Section title="Properties">
        <Placeholder label="Section content" />
      </Section>
    </Container>
  ),
};

export const WithTooltip: Story = {
  name: "With tooltip",
  render: () => (
    <Container>
      <Section title="Initial State" tooltip="The starting token distribution">
        <Placeholder label="Content with tooltip on header" />
      </Section>
    </Container>
  ),
};

export const Collapsible: Story = {
  name: "Collapsible",
  render: () => (
    <Container>
      <Section title="Advanced" collapsible>
        <Placeholder label="Collapsible content (open by default)" />
      </Section>
    </Container>
  ),
};

export const CollapsibleClosed: Story = {
  name: "Collapsible (initially closed)",
  render: () => (
    <Container>
      <Section title="Advanced" collapsible defaultOpen={false}>
        <Placeholder label="This starts collapsed" />
      </Section>
    </Container>
  ),
};

export const WithHeaderAction: Story = {
  name: "With header action",
  render: () => (
    <Container>
      <Section
        title="Tokens"
        renderHeaderAction={() => (
          <button
            type="button"
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      >
        <Placeholder label="Content with action button in header" />
      </Section>
    </Container>
  ),
};

export const List: Story = {
  name: "SectionList",
  render: () => (
    <Container>
      <SectionList>
        <Section title="General">
          <Placeholder label="General settings" />
        </Section>
        <Section title="Appearance">
          <Placeholder label="Color and style options" />
        </Section>
        <Section title="Advanced" collapsible defaultOpen={false}>
          <Placeholder label="Advanced configuration" />
        </Section>
      </SectionList>
    </Container>
  ),
};
