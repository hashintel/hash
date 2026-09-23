/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { type ReactNode, use, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryProvider } from "../../react/commands/command-registry";
import { ErrorTrackerContext } from "../../react/error-tracker-context";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../react/state/user-settings-context";
import { InstalledPluginsProvider } from "./installed-plugins";
import { definePetrinautPlugin, type PetrinautPlugin } from "./plugin";
import {
  HostAiAssistantContext,
  hostAiAssistantPlugin,
  PluginAssistants,
  useActiveAiAssistant,
  usePetrinautActiveAssistantId,
  usePetrinautAiAssistant,
} from "./plugin-assistants";

import type { PetrinautAiAssistant } from "../petrinaut";

afterEach(cleanup);

const assistantWith = (label: string): PetrinautAiAssistant => ({
  primaryLabel: label,
  transport: {
    sendMessages: () => Promise.reject(new Error("not used")),
    reconnectToStream: () => Promise.resolve(null),
  },
});

const mounts: string[] = [];

/** An assistant plugin whose component records its mounts and publishes. */
const assistantPlugin = (id: string, label: string) => {
  const assistant = assistantWith(label);
  const Assistant = () => {
    "use no memo"; // Closes over the factory's arguments, which the compiler would hoist out.
    useEffect(() => {
      mounts.push(id);
    }, []);
    usePetrinautAiAssistant(assistant);
    return null;
  };
  return definePetrinautPlugin({
    id,
    assistants: [{ id, label, component: Assistant }],
  });
};

/** Stands in for the settings selector: one button per assistant id. */
const ChooseProbe = ({ ids }: { ids: readonly string[] }) => {
  const { setAiAssistantId } = use(UserSettingsContext);
  return ids.map((id) => (
    <button key={id} type="button" onClick={() => setAiAssistantId(id)}>
      choose {id}
    </button>
  ));
};

/** The editor's side: what the AI panel would read, and the chosen id. */
const PanelProbe = () => {
  const active = useActiveAiAssistant();
  const activeId = usePetrinautActiveAssistantId();
  return (
    <>
      <output aria-label="active assistant">
        {active === null ? "none" : `${active.id}:${active.label}`}
      </output>
      <output aria-label="active assistant id">{activeId ?? "none"}</output>
    </>
  );
};

const renderAssistants = (
  plugins: readonly PetrinautPlugin[],
  options: {
    chosenId?: string | null;
    choices?: readonly string[];
    host?: PetrinautAiAssistant;
  } = {},
) => {
  const registry = createCommandRegistry();
  const captureException = vi.fn();
  const Settings = ({ children }: { children: ReactNode }) => {
    const [aiAssistantId, setAiAssistantId] = useState(
      options.chosenId ?? null,
    );
    return (
      <UserSettingsContext
        value={{
          ...defaultUserSettingsContextValue,
          aiAssistantId,
          setAiAssistantId,
        }}
      >
        {children}
      </UserSettingsContext>
    );
  };
  render(
    <ErrorTrackerContext value={{ captureException }}>
      <CommandRegistryProvider registry={registry}>
        <Settings>
          <InstalledPluginsProvider plugins={plugins}>
            <HostAiAssistantContext value={options.host}>
              <PluginAssistants>
                <PanelProbe />
                <ChooseProbe ids={options.choices ?? []} />
              </PluginAssistants>
            </HostAiAssistantContext>
          </InstalledPluginsProvider>
        </Settings>
      </CommandRegistryProvider>
    </ErrorTrackerContext>,
  );
  return {
    registry,
    captureException,
    choose: (id: string) =>
      fireEvent.click(screen.getByRole("button", { name: `choose ${id}` })),
    active: () =>
      screen.getByRole("status", { name: "active assistant" }).textContent,
    activeId: () =>
      screen.getByRole("status", { name: "active assistant id" }).textContent,
  };
};

const switchCommands = (registry: ReturnType<typeof createCommandRegistry>) =>
  registry
    .list()
    .filter((command) => command.id.startsWith("petrinaut.ai-assistant.use:"))
    .map((command) => command.label);

describe("PluginAssistants", () => {
  afterEach(() => {
    mounts.length = 0;
  });

  it("shows no assistant and offers no switch when none is installed", () => {
    const { active, registry } = renderAssistants([]);
    expect(active()).toBe("none");
    expect(switchCommands(registry)).toEqual([]);
  });

  it("shows the only assistant once its component has passed it", () => {
    const { active, registry } = renderAssistants([
      assistantPlugin("test.stock", "Stock"),
    ]);
    expect(active()).toBe("test.stock:Stock");
    expect(switchCommands(registry)).toEqual([]);
  });

  it("starts with the first assistant and switches to the chosen one", () => {
    const { active, choose, registry } = renderAssistants(
      [
        assistantPlugin("test.stock", "Stock"),
        assistantPlugin("test.brunch", "Brunch"),
      ],
      { choices: ["test.brunch"] },
    );
    expect(active()).toBe("test.stock:Stock");
    expect(mounts).toEqual(["test.stock"]);
    expect(switchCommands(registry)).toEqual(["Use the Brunch assistant"]);

    choose("test.brunch");
    expect(active()).toBe("test.brunch:Brunch");
    expect(mounts).toEqual(["test.stock", "test.brunch"]);
    expect(switchCommands(registry)).toEqual(["Use the Stock assistant"]);
  });

  it("switches from the palette", () => {
    const { active, registry } = renderAssistants([
      assistantPlugin("test.stock", "Stock"),
      assistantPlugin("test.brunch", "Brunch"),
    ]);
    act(() => {
      void registry.execute("petrinaut.ai-assistant.use:test.brunch");
    });
    expect(active()).toBe("test.brunch:Brunch");
  });

  it("falls back to the first assistant when the chosen one is gone", () => {
    const { active } = renderAssistants(
      [assistantPlugin("test.stock", "Stock")],
      { chosenId: "test.brunch" },
    );
    expect(active()).toBe("test.stock:Stock");
  });

  it("hides the panel while the assistant passes null, and still names it active", () => {
    const NotReady = () => {
      usePetrinautAiAssistant(null);
      return null;
    };
    const { active, activeId } = renderAssistants([
      definePetrinautPlugin({
        id: "test.pending",
        assistants: [
          { id: "test.pending", label: "Pending", component: NotReady },
        ],
      }),
    ]);
    expect(active()).toBe("none");
    expect(activeId()).toBe("test.pending");
  });

  it("reports a failing assistant and keeps the editor rendered", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const Broken = () => {
      throw new Error("assistant failure");
    };
    const { active, captureException } = renderAssistants([
      definePetrinautPlugin({
        id: "test.broken",
        assistants: [{ id: "test.broken", label: "Broken", component: Broken }],
      }),
    ]);
    expect(active()).toBe("none");
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "assistant failure" }),
      {
        source: "plugin.contribution",
        tags: {
          pluginId: "test.broken",
          contributionId: "test.broken",
          place: "assistant",
        },
      },
    );
    consoleError.mockRestore();
  });

  it("serves the deprecated aiAssistant prop as the first assistant", () => {
    const { active, registry } = renderAssistants(
      [hostAiAssistantPlugin, assistantPlugin("test.brunch", "Brunch")],
      { host: assistantWith("Host") },
    );
    expect(active()).toBe("petrinaut.host-ai-assistant:AI");
    expect(switchCommands(registry)).toEqual(["Use the Brunch assistant"]);
  });
});
