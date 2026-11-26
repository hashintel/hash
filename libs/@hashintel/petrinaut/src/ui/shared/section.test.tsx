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
import { afterEach, describe, expect, it } from "vitest";

import { Section } from "./section";

afterEach(cleanup);

describe("Section", () => {
  it("exposes the expanded state on its keyboard-accessible toggle", async () => {
    render(
      <Section title="Constraints" collapsible>
        <span>Condition</span>
      </Section>,
    );
    const trigger = screen.getByRole("button", {
      name: "Toggle Constraints section",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).toBe("false"),
    );
  });

  it("starts collapsed when it is not open by default, and opens on a click", async () => {
    render(
      <Section title="Computed state" collapsible defaultOpen={false}>
        <span>Condition</span>
      </Section>,
    );
    const trigger = screen.getByRole("button", {
      name: "Toggle Computed state section",
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).toBe("true"),
    );
  });
});
