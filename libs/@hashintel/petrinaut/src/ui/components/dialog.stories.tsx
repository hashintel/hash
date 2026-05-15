import { css } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "./button";
import { Dialog } from "./dialog";

const meta = {
  title: "Components / Dialog",
  parameters: {
    layout: "centered",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

// -- Shared styles -----------------------------------------------------------

const bodyTextStyle = css({
  fontSize: "[14px]",
  fontWeight: "medium",
  lineHeight: "[1.25]",
  color: "[#8d8d8d]",
  margin: "[0]",
});

// -- Stories -----------------------------------------------------------------

export const Default: Story = {
  name: "Default",
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="subtle">Open Dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header>Title</Dialog.Header>
          <Dialog.Body>
            <p className={bodyTextStyle}>
              This is a basic dialog with a title and body content.
            </p>
          </Dialog.Body>
        </Dialog.Card>
        <Dialog.Footer>
          <Dialog.CloseTrigger asChild>
            <Button variant="subtle">Cancel</Button>
          </Dialog.CloseTrigger>
          <Button variant="solid">Confirm</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

export const WithDescription: Story = {
  name: "With description",
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="subtle">Open Dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header description="This action cannot be undone.">
            Delete item
          </Dialog.Header>
          <Dialog.Body>
            <p className={bodyTextStyle}>
              Are you sure you want to delete this item? All associated data
              will be permanently removed.
            </p>
          </Dialog.Body>
        </Dialog.Card>
        <Dialog.Footer>
          <Dialog.CloseTrigger asChild>
            <Button variant="subtle">Cancel</Button>
          </Dialog.CloseTrigger>
          <Button variant="solid" tone="error">
            Delete
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

export const WithoutFooter: Story = {
  name: "Without footer",
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="subtle">Open Dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header description="Use the close button to dismiss.">
            Information
          </Dialog.Header>
          <Dialog.Body>
            <p className={bodyTextStyle}>
              This dialog only has a close button in the top-right corner. No
              footer actions are needed.
            </p>
          </Dialog.Body>
        </Dialog.Card>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

const ControlledDialogExample = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="subtle" onClick={() => setOpen(true)}>
        Open Controlled Dialog
      </Button>
      <Dialog.Root
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
      >
        <Dialog.Content>
          <Dialog.Card>
            <Dialog.Header>Controlled</Dialog.Header>
            <Dialog.Body>
              <p className={bodyTextStyle}>
                This dialog is controlled via React state. The open state is
                managed externally.
              </p>
            </Dialog.Body>
          </Dialog.Card>
          <Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <Button variant="subtle">Cancel</Button>
            </Dialog.CloseTrigger>
            <Button variant="solid" onClick={() => setOpen(false)}>
              Done
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export const Controlled: Story = {
  name: "Controlled",
  render: () => <ControlledDialogExample />,
};

export const OpenByDefault: Story = {
  name: "Open by default",
  render: () => (
    <Dialog.Root defaultOpen>
      <Dialog.Trigger asChild>
        <Button variant="subtle">Re-open Dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Card>
          <Dialog.Header description="Optional Description">
            Title
          </Dialog.Header>
          <Dialog.Body>
            <p className={bodyTextStyle}>
              This dialog opens automatically when the story loads.
            </p>
          </Dialog.Body>
        </Dialog.Card>
        <Dialog.Footer>
          <Dialog.CloseTrigger asChild>
            <Button variant="subtle">Cancel</Button>
          </Dialog.CloseTrigger>
          <Button variant="solid">Confirm</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};
