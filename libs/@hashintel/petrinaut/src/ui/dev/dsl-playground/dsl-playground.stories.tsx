import { MonacoProvider } from "../../monaco/provider";
import { DslPlayground } from "./dsl-playground";

import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * The Petrinaut DSL beside the document it projects: pick an example or edit
 * the YAML and read the DSL the printer writes for it.
 */
const meta = {
  title: "Dev / DSL Playground",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => (
    <MonacoProvider>
      <DslPlayground />
    </MonacoProvider>
  ),
};
