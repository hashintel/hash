import { useState } from "react";

import { Button } from "@hashintel/ds-components";

import {
  WalkthroughContext,
  type WalkthroughStep,
} from "./walkthrough-context";
import { WalkthroughDialog } from "./walkthrough-dialog";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components / Walkthrough",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const storySteps: WalkthroughStep[] = [
  {
    id: "welcome",
    title: "Welcome to Petrinaut",
    body: (
      <>
        <p>
          <strong>Petrinaut</strong> is a workshop for building, simulating, and
          analyzing Petri nets.
        </p>
      </>
    ),
    videoHref: "",
    videoAlt: "Placeholder",
  },
  {
    id: "second",
    title: "Run experiments",
    body: <p>Explore scenarios and inspect results.</p>,
    videoHref: "",
    videoAlt: "Placeholder",
  },
];

const HarnessedWalkthrough = ({
  initiallyOpen,
}: {
  initiallyOpen: boolean;
}) => {
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState(initiallyOpen);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--colors-neutral-s10, #f3f4f6)",
      }}
    >
      {!isWalkthroughOpen && (
        <Button variant="subtle" onClick={() => setIsWalkthroughOpen(true)}>
          Re-open walkthrough
        </Button>
      )}
      <WalkthroughContext value={{ steps: storySteps }}>
        <WalkthroughDialog
          open={isWalkthroughOpen}
          onClose={() => setIsWalkthroughOpen(false)}
        />
      </WalkthroughContext>
    </div>
  );
};

export const Default: Story = {
  name: "Default (auto-open)",
  render: () => <HarnessedWalkthrough initiallyOpen />,
};

export const Closed: Story = {
  name: "Closed — open from button",
  render: () => <HarnessedWalkthrough initiallyOpen={false} />,
};
