import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "@storybook/testing-library";

import { Page } from "./page";

const meta = {
  title: "Example/Page",
  component: Page,
  parameters: {
    // More on how to position stories at: https://storybook.js.org/docs/7.0/react/configure/story-layout
    layout: "fullscreen",
  },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoggedOut: Story = {};

// More on interaction testing: https://storybook.js.org/docs/7.0/react/writing-tests/interaction-testing
export const LoggedIn: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const loginButton = canvas.getByRole("button", {
      name: /Log in/i,
    });
    userEvent.click(loginButton);
  },
};
