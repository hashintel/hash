import { use } from "react";
import { userEvent, within } from "storybook/test";

import { css } from "@hashintel/ds-helpers/css";
import { productionMachines } from "@hashintel/petrinaut-core/examples";

import { UserSettingsContext } from "../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../react/state/user-settings-provider";
import { PetrinautStoryProvider } from "../petrinaut-story-provider";

import type { Meta, StoryObj } from "@storybook/react-vite";

const LayoutExample = ({
  readonly = false,
}: {
  expanded: boolean;
  readonly?: boolean;
}) => {
  const settings = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{
        ...settings,
        showWalkthroughOnInit: false,
      }}
    >
      <div className={css({ height: "[100vh]", width: "full" })}>
        <PetrinautStoryProvider
          initialTitle={productionMachines.title}
          initialDefinition={productionMachines.petriNetDefinition}
          readonly={readonly}
        />
      </div>
    </UserSettingsContext>
  );
};

const meta = {
  title: "Petrinaut / Expandable code sections",
  component: LayoutExample,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <UserSettingsProvider>
        <Story />
      </UserSettingsProvider>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole(
        "option",
        { name: /^Production Success/ },
        { timeout: 15000 },
      ),
    );
    const resultsToggle = await canvas.findByRole("button", {
      name: "Transition Results",
    });
    if (resultsToggle.getAttribute("aria-expanded") !== "true") {
      await userEvent.click(resultsToggle);
    }
    if (args.expanded) {
      const section = canvasElement.querySelector<HTMLElement>(
        '[id="transition-results"]',
      );
      if (!section) throw new Error("Transition results section is missing");
      await userEvent.click(
        await within(section).findByRole("button", {
          name: "Expand Transition Results",
        }),
      );
    }
  },
} satisfies Meta<typeof LayoutExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExpandedSection: Story = { args: { expanded: true } };
export const PropertiesPanel: Story = { args: { expanded: false } };
export const ReadOnly: Story = {
  args: { expanded: true, readonly: true },
};
