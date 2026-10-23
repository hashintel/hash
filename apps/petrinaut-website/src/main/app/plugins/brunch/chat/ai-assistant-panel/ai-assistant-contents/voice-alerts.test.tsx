/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { VoiceAlerts } from "./voice-alerts";

const initialClipboardDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  if (initialClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", initialClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("presents alert contract text as a short title and explanation", async () => {
  render(
    <VoiceAlerts
      alerts={[
        "Microphone unavailable. Permission was denied. (microphone-permission)",
      ]}
      docked={false}
      dockRef={createRef<HTMLDivElement>()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 1 Voice issue" }));

  expect(await screen.findByText("Microphone unavailable")).toBeTruthy();
  expect(
    screen.getByText("Permission was denied. (microphone-permission)"),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
});

test("reports an unavailable clipboard without throwing", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  render(
    <VoiceAlerts
      alerts={["Microphone unavailable. Permission was denied."]}
      docked={false}
      dockRef={createRef<HTMLDivElement>()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 1 Voice issue" }));
  fireEvent.click(await screen.findByRole("button", { name: "Copy details" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "Could not copy details",
    ),
  );
});

test("shows Copied only after clipboard succeeds and handles rejection", async () => {
  const writeText = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValueOnce();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <VoiceAlerts
      alerts={["Microphone unavailable. Permission was denied."]}
      docked={false}
      dockRef={createRef<HTMLDivElement>()}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show 1 Voice issue" }));
  const copy = await screen.findByRole("button", { name: "Copy details" });

  fireEvent.click(copy);
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Copy details" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Could not copy details",
  );

  fireEvent.click(copy);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
  );
});
