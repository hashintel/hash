import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
      description: "The variant style of the button",
    },
    colorScheme: {
      control: "select",
      options: ["brand", "neutral", "critical"],
      description: "The color scheme of the button",
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
      description: "The size of the button",
    },
    isLoading: {
      control: "boolean",
      description: "Whether the button is in a loading state",
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
  },
  args: {
    children: "Button",
    variant: "primary",
    colorScheme: "brand",
    size: "md",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// Primary Variants
export const PrimaryBrand: Story = {
  args: {
    variant: "primary",
    colorScheme: "brand",
    children: "Primary Brand",
  },
};

export const PrimaryNeutral: Story = {
  args: {
    variant: "primary",
    colorScheme: "neutral",
    children: "Primary Neutral",
  },
};

export const PrimaryCritical: Story = {
  args: {
    variant: "primary",
    colorScheme: "critical",
    children: "Primary Critical",
  },
};

// Secondary Variants
export const SecondaryBrand: Story = {
  args: {
    variant: "secondary",
    colorScheme: "brand",
    children: "Secondary Brand",
  },
};

export const SecondaryNeutral: Story = {
  args: {
    variant: "secondary",
    colorScheme: "neutral",
    children: "Secondary Neutral",
  },
};

export const SecondaryCritical: Story = {
  args: {
    variant: "secondary",
    colorScheme: "critical",
    children: "Secondary Critical",
  },
};

// Ghost Variants
export const GhostBrand: Story = {
  args: {
    variant: "ghost",
    colorScheme: "brand",
    children: "Ghost Brand",
  },
};

export const GhostNeutral: Story = {
  args: {
    variant: "ghost",
    colorScheme: "neutral",
    children: "Ghost Neutral",
  },
};

export const GhostCritical: Story = {
  args: {
    variant: "ghost",
    colorScheme: "critical",
    children: "Ghost Critical",
  },
};

// Sizes
export const Sizes: Story = {
  parameters: {
    controls: { exclude: ["size"] },
  },
  render: (args) => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Button {...args} size="xs">
        Extra Small
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

// States
export const Loading: Story = {
  args: {
    isLoading: true,
    children: "Loading",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: "Disabled",
  },
};

// With Icons
export const WithIconLeft: Story = {
  args: {
    iconLeft: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 12L4 8L8 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    children: "With Icon",
  },
};

export const WithIconRight: Story = {
  args: {
    iconRight: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 4L12 8L8 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    children: "With Icon",
  },
};

// All Variants Showcase
export const AllVariants: Story = {
  parameters: {
    controls: { disable: true },
  },
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h3 style={{ marginBottom: "12px" }}>Primary</h3>
        <div style={{ display: "flex", gap: "12px" }}>
          <Button variant="primary" colorScheme="brand">
            Brand
          </Button>
          <Button variant="primary" colorScheme="neutral">
            Neutral
          </Button>
          <Button variant="primary" colorScheme="critical">
            Critical
          </Button>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "12px" }}>Secondary</h3>
        <div style={{ display: "flex", gap: "12px" }}>
          <Button variant="secondary" colorScheme="brand">
            Brand
          </Button>
          <Button variant="secondary" colorScheme="neutral">
            Neutral
          </Button>
          <Button variant="secondary" colorScheme="critical">
            Critical
          </Button>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "12px" }}>Ghost</h3>
        <div style={{ display: "flex", gap: "12px" }}>
          <Button variant="ghost" colorScheme="brand">
            Brand
          </Button>
          <Button variant="ghost" colorScheme="neutral">
            Neutral
          </Button>
          <Button variant="ghost" colorScheme="critical">
            Critical
          </Button>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "12px" }}>Sizes</h3>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Button size="xs">XS</Button>
          <Button size="sm">SM</Button>
          <Button size="md">MD</Button>
          <Button size="lg">LG</Button>
        </div>
      </div>

      <div>
        <h3 style={{ marginBottom: "12px" }}>States</h3>
        <div style={{ display: "flex", gap: "12px" }}>
          <Button isLoading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </div>
    </div>
  ),
};
