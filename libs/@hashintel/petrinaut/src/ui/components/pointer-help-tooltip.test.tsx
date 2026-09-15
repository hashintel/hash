/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { FocusControls } from "../worksheet/focus-controls";
import { PointerHelpTooltip } from "./pointer-help-tooltip";

afterEach(cleanup);

it("keeps informational tooltips out of Tab and arrow navigation after rendering", () => {
  const toolbar = (content: string) => (
    <FocusControls axis="horizontal">
      <button type="button">Scenario</button>
      <PointerHelpTooltip content={content} />
      <input aria-label="Time step" type="number" />
    </FocusControls>
  );
  const { container, rerender } = render(toolbar("Help"));
  const trigger = container.querySelector<HTMLElement>(
    '[data-scope="tooltip"][data-part="trigger"]',
  );
  expect(trigger?.tabIndex).toBe(-1);
  rerender(toolbar("Updated help"));
  expect(trigger?.tabIndex).toBe(-1);
  const scenario = screen.getByRole("button", { name: "Scenario" });
  scenario.focus();
  fireEvent.keyDown(scenario, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("spinbutton", { name: "Time step" }),
  );
});
