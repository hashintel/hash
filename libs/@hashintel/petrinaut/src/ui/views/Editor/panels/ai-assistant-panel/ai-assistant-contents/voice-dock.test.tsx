/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { VoiceDock } from "./voice-dock";

const noop = () => {};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      public disconnect() {}
      public observe() {}
      public unobserve() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

test("renders an interrupted session as an unlabeled scoped ribbon with recovery", () => {
  render(
    <VoiceDock
      actions={{ end: noop, pause: noop, reconnect: noop }}
      assistantBusy={false}
      canReadFullResponse={false}
      canRepeatQuestion={false}
      canTakeTurn={false}
      collapsed={false}
      indicator={<span />}
      microphoneMuted={false}
      onCollapsedToggle={noop}
      onStop={noop}
      phase="error"
      speakerMuted={false}
      speakerVolume={1}
    />,
  );
  const dock = screen.getByTestId("ai-voice-dock");
  expect(dock.querySelector('canvas[data-phase="error"]')).not.toBeNull();
  expect(dock.querySelector('[data-part="visible-status"]')).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Voice interrupted");
  expect(
    screen.getByRole("button", { name: "Reconnect voice mode" }),
  ).toBeTruthy();
});
