import type { Story, StoryDefault } from "@ladle/react";

import { Button, type ButtonProps } from "./button";

export default {
  title: "Components/Button",
  argTypes: {
    variant: {
      control: { type: "select" },
      options: ["primary", "secondary", "ghost"],
      description: "The variant style of the button",
    },
    colorScheme: {
      control: { type: "select" },
      options: ["brand", "neutral", "critical"],
      description: "The color scheme of the button",
    },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md", "lg"],
      description: "The size of the button",
    },
    isLoading: {
      control: { type: "boolean" },
      description: "Whether the button is in a loading state",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Whether the button is disabled",
    },
  },
  args: {
    children: "Button",
    variant: "primary",
    colorScheme: "brand",
    size: "md",
  },
} satisfies StoryDefault<ButtonProps>;

// Primary Variants
export const PrimaryBrand: Story<ButtonProps> = (args) => <Button {...args} />;
PrimaryBrand.args = {
  variant: "primary",
  colorScheme: "brand",
  children: "Primary Brand",
};

export const PrimaryNeutral: Story<ButtonProps> = (args) => (
  <Button {...args} />
);
PrimaryNeutral.args = {
  variant: "primary",
  colorScheme: "neutral",
  children: "Primary Neutral",
};

export const PrimaryCritical: Story<ButtonProps> = (args) => (
  <Button {...args} />
);
PrimaryCritical.args = {
  variant: "primary",
  colorScheme: "critical",
  children: "Primary Critical",
};

// Secondary Variants
export const SecondaryBrand: Story<ButtonProps> = (args) => (
  <Button {...args} />
);
SecondaryBrand.args = {
  variant: "secondary",
  colorScheme: "brand",
  children: "Secondary Brand",
};

export const SecondaryNeutral: Story<ButtonProps> = (args) => (
  <Button {...args} />
);
SecondaryNeutral.args = {
  variant: "secondary",
  colorScheme: "neutral",
  children: "Secondary Neutral",
};

export const SecondaryCritical: Story<ButtonProps> = (args) => (
  <Button {...args} />
);
SecondaryCritical.args = {
  variant: "secondary",
  colorScheme: "critical",
  children: "Secondary Critical",
};

// Ghost Variants
export const GhostBrand: Story<ButtonProps> = (args) => <Button {...args} />;
GhostBrand.args = {
  variant: "ghost",
  colorScheme: "brand",
  children: "Ghost Brand",
};

export const GhostNeutral: Story<ButtonProps> = (args) => <Button {...args} />;
GhostNeutral.args = {
  variant: "ghost",
  colorScheme: "neutral",
  children: "Ghost Neutral",
};

export const GhostCritical: Story<ButtonProps> = (args) => <Button {...args} />;
GhostCritical.args = {
  variant: "ghost",
  colorScheme: "critical",
  children: "Ghost Critical",
};

// Sizes
export const Sizes: Story<ButtonProps> = (args) => (
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
);
Sizes.parameters = {
  controls: { exclude: ["size"] },
};

// States
export const Loading: Story<ButtonProps> = (args) => <Button {...args} />;
Loading.args = {
  isLoading: true,
  children: "Loading",
};

export const Disabled: Story<ButtonProps> = (args) => <Button {...args} />;
Disabled.args = {
  disabled: true,
  children: "Disabled",
};

// With Icons
export const WithIconLeft: Story<ButtonProps> = (args) => <Button {...args} />;
WithIconLeft.args = {
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
};

export const WithIconRight: Story<ButtonProps> = (args) => <Button {...args} />;
WithIconRight.args = {
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
};

// All Variants Showcase
export const AllVariants: Story<ButtonProps> = () => (
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
);
AllVariants.parameters = {
  controls: { disable: true },
};
