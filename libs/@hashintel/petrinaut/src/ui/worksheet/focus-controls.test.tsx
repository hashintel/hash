/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { FocusControls } from "./focus-controls";
import { FocusRoot, FocusStack } from "./focus-stack";

afterEach(cleanup);

it("walks toolbar controls, skips unavailable items and remembers entry", () => {
  render(
    <FocusRoot>
      <FocusStack axis="vertical">
        <FocusControls axis="horizontal">
          <button type="button">Scenario</button>
          <button type="button" disabled>
            Edit
          </button>
          <div inert>
            <button type="button">Unavailable</button>
          </div>
          <button type="button">Create</button>
        </FocusControls>
        <FocusControls>
          <button type="button">Value</button>
        </FocusControls>
      </FocusStack>
    </FocusRoot>,
  );
  const scenario = screen.getByRole("button", { name: "Scenario" });
  const create = screen.getByRole("button", { name: "Create" });
  const value = screen.getByRole("button", { name: "Value" });
  scenario.focus();
  fireEvent.keyDown(scenario, { key: "ArrowRight" });
  expect(document.activeElement).toBe(create);
  fireEvent.keyDown(create, { key: "ArrowDown" });
  expect(document.activeElement).toBe(value);
  fireEvent.keyDown(value, { key: "ArrowUp" });
  expect(document.activeElement).toBe(create);
});

it("keeps text arrows inside the value until its caret reaches an edge", () => {
  render(
    <FocusControls axis="horizontal">
      <button type="button">Previous</button>
      <input aria-label="Name" defaultValue="Experiment" />
      <button type="button">Next</button>
    </FocusControls>,
  );
  const input = screen.getByRole("textbox", {
    name: "Name",
  }) as HTMLInputElement;
  input.focus();
  input.setSelectionRange(3, 3);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(input);
  input.setSelectionRange(0, 0);
  fireEvent.keyDown(input, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Previous" }),
  );
  input.focus();
  input.setSelectionRange(10, 10);
  fireEvent.keyDown(input, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next" }),
  );
});

it("leaves arrow handling to an open picker", () => {
  render(
    <FocusControls>
      <button type="button" aria-expanded="true" aria-haspopup="listbox">
        Picker
      </button>
      <button type="button">Next</button>
    </FocusControls>,
  );
  const picker = screen.getByRole("button", { name: "Picker" });
  picker.focus();
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  expect(document.activeElement).toBe(picker);
});

it("moves horizontally between native number inputs", () => {
  render(
    <FocusControls axis="horizontal">
      <input type="number" aria-label="Runs" defaultValue="1000" />
      <input type="number" aria-label="Time step" defaultValue="0.1" />
    </FocusControls>,
  );
  const runs = screen.getByRole("spinbutton", { name: "Runs" });
  const step = screen.getByRole("spinbutton", { name: "Time step" });
  runs.focus();
  fireEvent.keyDown(runs, { key: "ArrowRight" });
  expect(document.activeElement).toBe(step);
  fireEvent.keyDown(step, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(runs);
});

it("preserves arrow events for native objective choices inside a focus group", () => {
  render(
    <FocusControls>
      <input type="radio" name="objective" aria-label="First objective" />
      <input type="radio" name="objective" aria-label="Second objective" />
      <button type="button">Add metric</button>
    </FocusControls>,
  );
  const first = screen.getByRole("radio", { name: "First objective" });
  first.focus();
  expect(fireEvent.keyDown(first, { key: "ArrowDown" })).toBe(true);
  expect(document.activeElement).toBe(first);
});
