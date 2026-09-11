/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PropertyValue } from "./property-value";

const isReadOnly = vi.hoisted(() => ({ current: false }));

vi.mock("../../react/state/use-is-read-only", () => ({
  useIsReadOnly: () => isReadOnly.current,
}));

afterEach(cleanup);

describe("PropertyValue", () => {
  it("renders the editing control while the net is editable", () => {
    isReadOnly.current = false;
    render(
      <PropertyValue text="Susceptible">
        <input defaultValue="Susceptible" />
      </PropertyValue>,
    );

    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("renders the value as text once the net is read-only", () => {
    isReadOnly.current = true;
    render(
      <PropertyValue text="Susceptible">
        <input defaultValue="Susceptible" />
      </PropertyValue>,
    );

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Susceptible")).toBeDefined();
  });

  it.each([undefined, null, "   "])(
    "stands in for a value the net does not carry (%s)",
    (text) => {
      isReadOnly.current = true;
      render(
        <PropertyValue text={text} emptyText="No description">
          <input />
        </PropertyValue>,
      );

      expect(screen.getByText("No description")).toBeDefined();
    },
  );
});
