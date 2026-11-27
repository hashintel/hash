/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { createContext, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  usePublished,
  useSelected,
  useSelectedFields,
  type Published,
} from "./select-from-context";

type Settings = { theme: string; volume: number; muted: boolean };

const initialSettings: Settings = { theme: "light", volume: 1, muted: false };
const SettingsContext = createContext<Settings>(initialSettings);
const SettingsPublishedContext = createContext<Published<Settings>>(null);

const onRender = { theme: vi.fn(), volume: vi.fn(), sound: vi.fn() };
const renders = () => ({
  theme: onRender.theme.mock.calls.length,
  volume: onRender.volume.mock.calls.length,
  sound: onRender.sound.mock.calls.length,
});

// Counted from inside: a component that a context renders is not seen by a
// `Profiler` above it.
const Theme = () => {
  "use no memo";
  onRender.theme();
  const theme = useSelected(
    SettingsContext,
    SettingsPublishedContext,
    (settings) => settings.theme,
  );
  return <output aria-label="theme">{theme}</output>;
};

const Volume = () => {
  "use no memo";
  onRender.volume();
  const volume = useSelected(
    SettingsContext,
    SettingsPublishedContext,
    (settings) => settings.volume,
  );
  return <output aria-label="volume">{volume}</output>;
};

const Sound = () => {
  "use no memo";
  onRender.sound();
  const { volume, muted } = useSelectedFields(
    SettingsContext,
    SettingsPublishedContext,
    ["volume", "muted"],
  );
  return <output aria-label="sound">{muted ? "muted" : volume}</output>;
};

const readers = (
  <>
    <Theme />
    <Volume />
    <Sound />
  </>
);

/** A provider that publishes, with a button for each change. */
const PublishingProvider = () => {
  const [settings, setSettings] = useState(initialSettings);
  const published = usePublished(settings);
  return (
    <SettingsPublishedContext value={published}>
      <SettingsContext value={settings}>
        <button
          type="button"
          onClick={() =>
            setSettings({ ...settings, volume: settings.volume + 1 })
          }
        >
          Louder
        </button>
        <button
          type="button"
          onClick={() => setSettings({ ...settings, theme: "dark" })}
        >
          Dark
        </button>
        <button
          type="button"
          onClick={() => setSettings({ ...settings, muted: true })}
        >
          Mute
        </button>
        {readers}
      </SettingsContext>
    </SettingsPublishedContext>
  );
};

/** The context provided alone, as a test or a story does. */
const BareProvider = () => {
  const [settings, setSettings] = useState(initialSettings);
  return (
    <SettingsContext value={settings}>
      <button
        type="button"
        onClick={() =>
          setSettings({ ...settings, volume: settings.volume + 1 })
        }
      >
        Louder
      </button>
      {readers}
    </SettingsContext>
  );
};

const click = (name: string) =>
  act(() => screen.getByRole("button", { name }).click());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders a reader only when the part it selected changes", () => {
  render(<PublishingProvider />);
  expect(renders()).toEqual({ theme: 1, volume: 1, sound: 1 });

  click("Louder");
  expect(screen.getByLabelText("volume").textContent).toBe("2");
  expect(renders()).toEqual({ theme: 1, volume: 2, sound: 2 });

  click("Dark");
  expect(screen.getByLabelText("theme").textContent).toBe("dark");
  expect(renders()).toEqual({ theme: 2, volume: 2, sound: 2 });
});

it("renders a reader of several fields when one of them changes", () => {
  render(<PublishingProvider />);

  click("Mute");

  expect(screen.getByLabelText("sound").textContent).toBe("muted");
  expect(renders()).toEqual({ theme: 1, volume: 1, sound: 2 });
});

it("follows the context itself where nothing is published", () => {
  render(<BareProvider />);
  expect(screen.getByLabelText("volume").textContent).toBe("1");

  click("Louder");

  expect(screen.getByLabelText("volume").textContent).toBe("2");
  expect(screen.getByLabelText("theme").textContent).toBe("light");
  // As any reader of a context: it rendered for a part it did not select.
  expect(renders()).toEqual({ theme: 2, volume: 2, sound: 2 });
});
