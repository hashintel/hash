/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModeSelector } from "./mode-selector";

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;

describe("ModeSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the host indicator in Simulate's accessible label and activates the mode from it", async () => {
    const onChange = vi.fn();

    render(
      <ModeSelector
        actualModeAvailable
        mode="edit"
        onChange={onChange}
        simulateModeIndicator={<span data-testid="simulate-indicator">1</span>}
      />,
    );

    expect(screen.getByRole("radio", { name: /Simulate.*1/u })).toBeTruthy();
    expect(
      screen.queryByRole("img", { name: /flask|experiment/iu }),
    ).toBeNull();

    const indicator = screen.getByTestId("simulate-indicator");
    const simulateLabel = indicator.closest("label");
    expect(simulateLabel).not.toBeNull();

    simulateLabel?.click();

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("simulate"));
  });
});
