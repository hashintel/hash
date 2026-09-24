/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { BrunchWorkFold } from "./brunch-work-fold";

afterEach(cleanup);

test.each([
  ["streaming", "Working…", "true"],
  ["settled", "Activity · 7s", "false"],
  ["approval", "Approval required", "true"],
  ["stopped", "Stopped", "true"],
] as const)(
  "%s fold label and default disclosure",
  (status, label, expanded) => {
    render(
      <BrunchWorkFold status={status} elapsedMs={7_900}>
        Work details
      </BrunchWorkFold>,
    );
    expect(
      screen.getByRole("button", { name: label }).getAttribute("aria-expanded"),
    ).toBe(expanded);
  },
);

test("settles after approval and permits manual reopening", async () => {
  const { rerender } = render(
    <BrunchWorkFold status="approval">Allow or deny</BrunchWorkFold>,
  );
  rerender(<BrunchWorkFold status="settled">Approved</BrunchWorkFold>);
  const trigger = screen.getByRole("button", { name: "Activity" });
  await waitFor(() =>
    expect(trigger.getAttribute("aria-expanded")).toBe("false"),
  );
  fireEvent.click(trigger);
  await waitFor(() =>
    expect(trigger.getAttribute("aria-expanded")).toBe("true"),
  );
});
