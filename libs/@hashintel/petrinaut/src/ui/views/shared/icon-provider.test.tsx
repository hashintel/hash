/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, expect, it } from "vitest";

import { Icon } from "@hashintel/ds-components";
import {
  HashIconProvider,
  PlayIcon,
  useHashIconPackEnabled,
} from "@hashintel/ds-icons";

import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../../react/state/user-settings-context";
import { PetrinautIconProvider } from "./icon-provider";

afterEach(cleanup);

/** The name of the set's icon an element draws, or null for another drawing. */
const iconOfTheSet = (label: string) =>
  screen.getByRole("img", { name: label }).getAttribute("data-icon");

/** As a host's component decides between the set and a drawing of its own. */
const HostIcon = () => (useHashIconPackEnabled() ? "the set" : "its own");

it("draws the design system's icons from the set, also through a portal", () => {
  const { unmount } = render(<Icon name="play" alt="Play" />);
  expect(iconOfTheSet("Play")).toBeNull();
  unmount();

  render(
    <PetrinautIconProvider>
      <Icon name="play" alt="Play" />
      {createPortal(<Icon name="pause" alt="Pause" />, document.body)}
    </PetrinautIconProvider>,
  );

  expect(iconOfTheSet("Play")).toBe("play");
  expect(iconOfTheSet("Pause")).toBe("pause");
});

it("tells a host's component the set is in use, whatever a provider above says", () => {
  render(
    <HashIconProvider enabled={false}>
      <PetrinautIconProvider>
        <HostIcon />
      </PetrinautIconProvider>
    </HashIconProvider>,
  );

  expect(screen.getByText("the set")).toBeTruthy();
});

it("stops the icons' motion while Animations is off", () => {
  const motionOf = (label: string) =>
    screen
      .getByRole("img", { name: label })
      .querySelector("[data-icon-motion]")
      ?.getAttribute("data-icon-motion");
  const playIcon = (showAnimations: boolean) => (
    <UserSettingsContext
      value={{ ...defaultUserSettingsContextValue, showAnimations }}
    >
      <PetrinautIconProvider>
        <PlayIcon aria-label="Play" />
      </PetrinautIconProvider>
    </UserSettingsContext>
  );

  const { rerender } = render(playIcon(true));
  expect(motionOf("Play")).toBe("auto");

  rerender(playIcon(false));
  expect(motionOf("Play")).toBe("none");
});
