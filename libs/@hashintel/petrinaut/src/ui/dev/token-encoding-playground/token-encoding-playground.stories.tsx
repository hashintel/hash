import { MonacoProvider } from "../../monaco/provider";
import { TokenEncodingPlayground } from "./token-encoding-playground";

import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Interactive inspector for the simulation token encoding: define a colour's
 * dimensions, author a token value, and see the exact bits stored in the
 * frame buffer — in the shipped v1 layout (uniform f64 slots) or the planned
 * format-v2 packed struct (u8 booleans, alignment padding).
 */
const meta = {
  title: "Dev / Token Encoding Playground",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <MonacoProvider>
      <TokenEncodingPlayground />
    </MonacoProvider>
  ),
};
