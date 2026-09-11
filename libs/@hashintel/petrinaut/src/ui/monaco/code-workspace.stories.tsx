import { use, useState } from "react";
import { userEvent, within } from "storybook/test";

import { css } from "@hashintel/ds-helpers/css";
import { productionMachines } from "@hashintel/petrinaut-core/examples";

import { UserSettingsContext } from "../../react/state/user-settings-context";
import { UserSettingsProvider } from "../../react/state/user-settings-provider";
import { PetrinautStoryProvider } from "../petrinaut-story-provider";

import type { CodeEditorPlacement } from "../../react/state/user-settings-context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const LayoutExample = ({
  placement,
  readonly = false,
}: {
  placement: CodeEditorPlacement;
  readonly?: boolean;
}) => {
  const settings = use(UserSettingsContext);
  const [enabled, setEnabled] = useState(true);
  const [layout, setLayout] = useState(placement);
  return (
    <UserSettingsContext
      value={{
        ...settings,
        showWalkthroughOnInit: false,
        enableCodeEditorWorkspace: enabled,
        setEnableCodeEditorWorkspace: setEnabled,
        codeEditorPlacement: layout,
        setCodeEditorPlacement: setLayout,
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
  title: "Petrinaut / Code editor layouts",
  component: LayoutExample,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <UserSettingsProvider>
        <Story />
      </UserSettingsProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole(
        "button",
        { name: "Open code" },
        { timeout: 15000 },
      ),
    );
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole("menuitem", {
        name: "Production Success / Transition kernel",
      }),
    );
  },
} satisfies Meta<typeof LayoutExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FullScreen: Story = { args: { placement: "fullscreen" } };
export const PropertiesPanel: Story = { args: { placement: "properties" } };
export const BottomDock: Story = { args: { placement: "bottom" } };
export const ReadOnly: Story = {
  args: { placement: "properties", readonly: true },
};
