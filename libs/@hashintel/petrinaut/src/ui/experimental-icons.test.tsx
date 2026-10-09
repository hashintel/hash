import { cleanup, fireEvent, render, screen } from "@testing-library/react";
/** @vitest-environment jsdom */
import { use } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Icon, IconProvider } from "@hashintel/ds-components";

import { UserSettingsContext } from "../react/state/user-settings-context";
import { UserSettingsProvider } from "../react/state/user-settings-provider";
import { AiAssistantIcon } from "./components/ai-assistant-icon";
import { ExperimentalIconProvider, PlayIcon } from "./experimental-icons";

const SettingsExample = () => {
  const { enableExperimentalIconPack, setEnableExperimentalIconPack } =
    use(UserSettingsContext);
  return (
    <ExperimentalIconProvider enabled={enableExperimentalIconPack}>
      <button
        type="button"
        onClick={() =>
          setEnableExperimentalIconPack(!enableExperimentalIconPack)
        }
      >
        Toggle icon pack
      </button>
      <Icon name="play" alt="Play" />
      <IconProvider icons={{ play: PlayIcon }}>
        <Icon name="barcode" alt="Barcode" />
      </IconProvider>
      <AiAssistantIcon title="Assistant" />
      {createPortal(<Icon name="pause" alt="Pause in portal" />, document.body)}
    </ExperimentalIconProvider>
  );
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("experimental icon preference", () => {
  it("switches immediately, persists across mounts, and restores the defaults", () => {
    localStorage.setItem(
      "petrinaut:user-settings",
      JSON.stringify({ showMinimap: false, enableExperimentalIconPack: false }),
    );
    const { unmount } = render(
      <UserSettingsProvider>
        <SettingsExample />
      </UserSettingsProvider>,
    );
    const originalPlay = screen.getByRole("img", { name: "Play" }).outerHTML;
    const originalBarcode = screen.getByRole("img", {
      name: "Barcode",
    }).outerHTML;
    const originalAssistant = screen.getByRole("img", {
      name: "Assistant",
    }).outerHTML;
    expect(originalPlay).not.toContain("petrinaut-experimental");

    fireEvent.click(screen.getByRole("button", { name: "Toggle icon pack" }));
    expect(
      screen.getByRole("img", { name: "Play" }).getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    expect(
      screen.getByRole("img", { name: "Assistant" }).getAttribute("data-icon"),
    ).toBe("agent");
    expect(
      screen
        .getByRole("img", { name: "Pause in portal" })
        .getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    expect(screen.getByRole("img", { name: "Barcode" }).outerHTML).toBe(
      originalBarcode,
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({
      enableExperimentalIconPack: true,
      showMinimap: false,
    });

    unmount();
    render(
      <UserSettingsProvider>
        <SettingsExample />
      </UserSettingsProvider>,
    );
    expect(
      screen.getByRole("img", { name: "Play" }).getAttribute("data-icon-pack"),
    ).toBe("petrinaut-experimental");
    fireEvent.click(screen.getByRole("button", { name: "Toggle icon pack" }));
    expect(screen.getByRole("img", { name: "Play" }).outerHTML).toBe(
      originalPlay,
    );
    expect(screen.getByRole("img", { name: "Assistant" }).outerHTML).toBe(
      originalAssistant,
    );
  });

  it.each([
    { parentEnabled: false, enabled: undefined, expected: false },
    { parentEnabled: true, enabled: undefined, expected: true },
    { parentEnabled: false, enabled: true, expected: true },
    { parentEnabled: true, enabled: false, expected: false },
    { parentEnabled: undefined, enabled: undefined, expected: true },
  ])(
    "resolves nested enabled=$enabled with parent enabled=$parentEnabled to $expected",
    ({ parentEnabled, enabled, expected }) => {
      const Sample = ({ parent }: { parent?: boolean }) => (
        <ExperimentalIconProvider enabled={parent} weight={700}>
          <ExperimentalIconProvider enabled={enabled} size={16}>
            <Icon name="play" alt="Play" />
            <AiAssistantIcon title="Assistant" />
          </ExperimentalIconProvider>
        </ExperimentalIconProvider>
      );
      const { rerender } = render(<Sample parent={parentEnabled} />);
      const expectEnabled = (isEnabled: boolean) => {
        for (const name of ["Play", "Assistant"]) {
          expect(
            screen.getByRole("img", { name }).getAttribute("data-icon-pack"),
          ).toBe(isEnabled ? "petrinaut-experimental" : null);
        }
      };
      expectEnabled(expected);
      rerender(<Sample parent={!parentEnabled} />);
      expectEnabled(enabled ?? !parentEnabled);
    },
  );
});
